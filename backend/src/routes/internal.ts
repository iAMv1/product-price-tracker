import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { getLatestAttempts, listActiveTrackedProducts } from '../persistence/repositories.js';
import { rowToTarget, runAllTargets } from '../scraper/runner.js';
import { readDeps, requireDb } from '../http/deps.js';

/**
 * Scheduler entrypoint (SCHED-001). External cron (cron-job.org) POSTs here
 * every 2 hours with `Authorization: Bearer <CRON_SECRET>`. No in-process
 * loop anywhere — free-tier instances may sleep between invocations.
 */

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
  const rows = await listActiveTrackedProducts(db);
  // Per-product frequency (bonus): skip targets scraped more recently than
  // their interval. Never scraped => always due. One batched latest-attempt
  // lookup covers every target (no N+1 against the free-tier connection cap).
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
  const summary = await runAllTargets(db, {
    triggerType: 'scheduled',
    targets: due,
    scrape,
  });
  res.json({ ...summary, skipped });
});
