import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import {
  abandonStaleRuns,
  acquireLease,
  createScrapeRun,
  failScrapeRun,
  getLatestAttempts,
  heartbeatScrapeRun,
  listActiveTrackedProducts,
  releaseLease,
  renewLease,
} from '../persistence/repositories.js';
import { executeScrapeRun, rowToTarget } from '../scraper/runner.js';
import { readDeps, requireDb } from '../http/deps.js';

/**
 * Scheduler entrypoint (SCHED-001). External cron (cron-job.org) POSTs here
 * every 2 hours with `Authorization: Bearer <CRON_SECRET>`. No in-process
 * loop anywhere — free-tier instances may sleep between invocations.
 *
 * Dispatch model (survives the cron edge's 30s request timeout):
 *   1. recover runs orphaned by a dead process (stale -> 'abandoned');
 *   2. take the single-flight lease (overlapping schedulers no-op honestly);
 *   3. persist the due-target run row (durable claim);
 *   4. reply 202 immediately, then execute with heartbeat + lease renewal.
 * `?wait=true` keeps synchronous semantics for tests/ops.
 * Run state survives process death: the heartbeat stops, so the next
 * invocation abandons the run and the due-check re-scrapes whatever never
 * got an attempt recorded.
 */

const LEASE_KEY = 'scrape-all';
const LEASE_TTL_MS = 15 * 60_000; // heartbeat renews while a batch runs
const STALE_RUN_MINUTES = 15; // > worst-case batch, << 2h cadence

export const internalRouter = Router();

function authorized(req: Request): boolean {
  const header = req.headers.authorization ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = env.cronSecret;
  if (presented === '' || expected === '') return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

internalRouter.post('/scrape-all', async (req: Request, res: Response) => {
  if (!authorized(req)) {
    res.status(401).json({ error: 'unauthorized', message: 'valid Bearer CRON_SECRET required' });
    return;
  }
  const db = await requireDb(req, res);
  if (db === null) return;
  const { scrape } = readDeps(req);
  const wait = req.query['wait'] === 'true' || req.query['wait'] === '1';

  // 1) Stale-run recovery: a crashed process leaves 'running' rows behind;
  // the next invocation turns them into visible 'abandoned' evidence.
  const recovered = await abandonStaleRuns(db, STALE_RUN_MINUTES);

  // 2) Single-flight: two scheduler edges racing (timeout-retry, keep-alive
  // wake + pg_cron rescue) must never double-scrape the same due set.
  const leaseOwner = randomUUID();
  const leased = await acquireLease(db, LEASE_KEY, leaseOwner, LEASE_TTL_MS);
  if (!leased) {
    res.json({
      dispatched: false,
      reason: 'lease-held',
      recovered,
      skipped: 0,
      message: 'another scheduler invocation is running this batch',
    });
    return;
  }

  // Bound to the run row once it exists (assigned before any execution).
  let runIdForHeartbeat = '';
  const hooks = {
    onTargetDone: async (): Promise<void> => {
      await heartbeatScrapeRun(db, runIdForHeartbeat);
      await renewLease(db, LEASE_KEY, leaseOwner, LEASE_TTL_MS);
    },
  };

  try {
    // 3) Per-product frequency (bonus): skip targets scraped more recently
    // than their interval (cadence policy: interval since the most recent
    // attempt, any outcome — documented). Never scraped => always due. One
    // batched latest-attempt lookup covers every target (no N+1 against the
    // free-tier connection cap).
    const rows = await listActiveTrackedProducts(db);
    const latest = new Map(
      (await getLatestAttempts(db)).map((a) => [a.trackedProductId, a.attemptedAt]),
    );
    const due = [];
    let skipped = 0;
    for (const row of rows) {
      const interval =
        typeof row.scrape_interval_hours === 'number' ? row.scrape_interval_hours : 2;
      const lastAt = latest.get(row.id);
      const stamp = lastAt === undefined ? NaN : Date.parse(lastAt);
      if (Number.isFinite(stamp) && Date.now() - stamp < interval * 3600 * 1000) {
        skipped += 1;
        continue;
      }
      due.push(rowToTarget(row));
    }

    // 4) Durable claim: the run row exists before ANY response, so both the
    // fast path and a dying process leave truthful state behind.
    const run = await createScrapeRun(db, {
      triggerType: 'scheduled',
      targetCount: due.length,
    });
    runIdForHeartbeat = run.id;

    if (wait) {
      // Synchronous mode (tests/ops): same shape as the original blocking
      // implementation, counts included, lease released before responding.
      try {
        const summary = await executeScrapeRun(db, run.id, { targets: due, scrape, hooks });
        res.json({ runId: run.id, ...summary, skipped, recovered, dispatched: true });
      } catch (error) {
        console.error(`[scheduler] run ${run.id} failed:`, error);
        await failScrapeRun(db, run.id);
        res.status(500).json({ error: 'internal_error', message: String(error) });
      } finally {
        await releaseLease(db, LEASE_KEY, leaseOwner).catch(() => undefined);
      }
      return;
    }

    // 5) Fast dispatch: reply now, execute durably in the background.
    console.log(
      `[scheduler] dispatched run ${run.id} due=${due.length} skipped=${skipped} recovered=${recovered}`,
    );
    void (async () => {
      try {
        await executeScrapeRun(db, run.id, { targets: due, scrape, hooks });
        console.log(`[scheduler] run ${run.id} completed`);
      } catch (error) {
        // Escaping error: mark failed instead of leaving 'running' forever.
        console.error(`[scheduler] run ${run.id} failed:`, error);
        await failScrapeRun(db, run.id).catch((markError) => {
          console.error(`[scheduler] could not mark run ${run.id} failed:`, markError);
        });
      } finally {
        await releaseLease(db, LEASE_KEY, leaseOwner).catch((releaseError) => {
          // A missed release still expires via leased_until — never fatal.
          console.error('[scheduler] lease release failed (expires by ttl):', releaseError);
        });
      }
    })();
    res.status(202).json({
      dispatched: true,
      runId: run.id,
      due: due.length,
      skipped,
      recovered,
    });
  } catch (error) {
    await releaseLease(db, LEASE_KEY, leaseOwner).catch(() => undefined);
    throw error;
  }
});
