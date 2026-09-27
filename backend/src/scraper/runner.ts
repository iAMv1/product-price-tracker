import type { Queryable } from '../persistence/db.js';
import {
  completeScrapeRun,
  createScrapeRun,
  pinTrackedProductSku,
  recordNonSuccessAttempt,
  recordSuccessfulAttempt,
  type TrackedProductRow,
} from '../persistence/repositories.js';
import { backoffMs, MAX_ATTEMPTS, realSleep, type Sleep } from './retry.js';
import { errMsg } from '../http/guards.js';
import type { ScrapeInput, ScrapeResult } from './store/types.js';

/**
 * Scrape orchestrator (SCRAPE-002). Maps scraper results to attempt rows:
 * ok:true -> success; ok:false && transient && budget-remains -> retried;
 * everything else -> failed. By construction a `retried` row always has a
 * follower and a `failed` row never does — the runner, not the database,
 * owns that invariant (SYSTEM_MODEL.md section 5).
 */

export interface TargetInput {
  id: string;
  storeProductId: string;
  productName: string;
  selectedOption: string;
  productUrl: string;
  scrapeIntervalHours?: number;
  /** Pinned SKU (absent until trust-on-first-use captures it). */
  expectedSku?: string;
}

export function rowToTarget(row: TrackedProductRow): TargetInput {
  return {
    id: row.id,
    storeProductId: row.store_product_id,
    productName: row.product_name,
    selectedOption: row.selected_option,
    productUrl: row.product_url,
    scrapeIntervalHours:
      typeof row.scrape_interval_hours === 'number' ? row.scrape_interval_hours : 2,
    ...(typeof row.sku === 'string' && row.sku !== '' ? { expectedSku: row.sku } : {}),
  };
}

export type ScrapeFn = (input: ScrapeInput) => Promise<ScrapeResult>;

export interface TargetOutcome {
  targetId: string;
  finalOutcome: 'success' | 'failed';
  attempts: number;
  /** Item SKU observed on the final successful attempt (TOFU pinning). */
  observedSku?: string;
}

/**
 * Run one target to completion: at most MAX_ATTEMPTS tries, backoff between
 * transient failures, every attempt persisted. Never throws for domain
 * failures; an escaping throw (programmer error) becomes one terminal
 * `internal_error` row so the batch — and the evidence — survives it.
 */
export async function runTarget(
  db: Queryable,
  runId: string,
  target: TargetInput,
  scrape: ScrapeFn,
  sleep: Sleep = realSleep,
  onTiming?: (timing: TargetTiming) => void,
): Promise<TargetOutcome> {
  const timed = (finalOutcome: string, attempts: number, scrapeMs: number, commitMs: number) =>
    onTiming?.({ targetId: target.id, finalOutcome, attempts, scrapeMs, commitMs });
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let result: ScrapeResult;
    const scrapeStart = Date.now();
    try {
      result = await scrape({
        productId: target.storeProductId,
        selectedOption: target.selectedOption,
        productUrl: target.productUrl,
        ...(target.expectedSku !== undefined ? { expectedSku: target.expectedSku } : {}),
      });
    } catch (error) {
      const message = errMsg(error);
      await recordNonSuccessAttempt(db, {
        runId,
        trackedProductId: target.id,
        attemptNumber: attempt,
        outcome: 'failed',
        errorCode: 'internal_error',
        errorMessage: `scraper threw instead of returning a failure: ${message}`,
      });
      timed('failed', attempt, Date.now() - scrapeStart, 0);
      return { targetId: target.id, finalOutcome: 'failed', attempts: attempt };
    }
    const scrapeMs = Date.now() - scrapeStart;

    if (result.ok) {
      const commitStart = Date.now();
      await recordSuccessfulAttempt(db, {
        runId,
        trackedProductId: target.id,
        attemptNumber: attempt,
        outcome: 'success',
        price: result.price,
        stock: result.stock,
        durationMs: result.durationMs,
      });
      timed('success', attempt, scrapeMs, Date.now() - commitStart);
      return {
        targetId: target.id,
        finalOutcome: 'success',
        attempts: attempt,
        ...(result.sku !== undefined ? { observedSku: result.sku } : {}),
      };
    }

    const budgetRemains = attempt < MAX_ATTEMPTS;
    if (result.transient && budgetRemains) {
      await recordNonSuccessAttempt(db, {
        runId,
        trackedProductId: target.id,
        attemptNumber: attempt,
        outcome: 'retried',
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        durationMs: result.durationMs,
      });
      await sleep(backoffMs(attempt));
      continue;
    }
    await recordNonSuccessAttempt(db, {
      runId,
      trackedProductId: target.id,
      attemptNumber: attempt,
      outcome: 'failed',
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
    });
    timed('failed', attempt, scrapeMs, 0);
    return { targetId: target.id, finalOutcome: 'failed', attempts: attempt };
  }
  // Unreachable by construction: the loop always returns on its last
  // iteration (success, terminal failure, or budget-exhausted failure).
  // Kept as a defensive assert so a future edit cannot silently fall through.
  throw new Error('runTarget exhausted attempts without returning');
}

export interface BatchSummary {
  runId: string;
  succeeded: number;
  failed: number;
  retriedAttempts: number;
  totalAttempts: number;
}

export interface RunHooks {
  /**
   * Called after every target: the dispatcher uses it to heartbeat the run
   * row (and renew the scheduler lease) so a live batch never looks dead.
   */
  onTargetDone?: () => Promise<void>;
  /**
   * Boundary timings per target (scrape vs commit). The manual route logs
   * one line per scrape so a slow dialog can be attributed to scraper, DB,
   * or HTTP — the scheduler path passes nothing and stays silent.
   */
  onTiming?: (timing: TargetTiming) => void;
}

export interface TargetTiming {
  targetId: string;
  finalOutcome: string;
  attempts: number;
  /** Scraper wall time for the final attempt. */
  scrapeMs: number;
  /** DB commit time for the final observation (0 when nothing was stored). */
  commitMs: number;
}

/**
 * Execute an ALREADY-CREATED run row to completion. Split from
 * runAllTargets so the scheduler can persist the run (durable claim)
 * before answering the cron edge, then finish in the background.
 */
export async function executeScrapeRun(
  db: Queryable,
  runId: string,
  input: {
    targets: TargetInput[];
    scrape: ScrapeFn;
    sleep?: Sleep;
    hooks?: RunHooks;
  },
): Promise<Omit<BatchSummary, 'runId'>> {
  const sleep = input.sleep ?? realSleep;
  let succeeded = 0;
  let failed = 0;
  let totalAttempts = 0;
  // Targets are processed SERIALLY on purpose: upstream reliability matters
  // more than throughput at assignment scale, and parallel bursts invite the
  // storefront's rate limiter. Do not "optimize" this into Promise.all
  // without re-checking rate limits and the single-flight lease budget.
  for (const target of input.targets) {
    const outcome = await runTarget(db, runId, target, input.scrape, sleep, input.hooks?.onTiming);
    totalAttempts += outcome.attempts;
    if (outcome.finalOutcome === 'success') succeeded += 1;
    else failed += 1;
    // Trust-on-first-use SKU pinning: the first observed SKU becomes the
    // row's pin; a pin, once set, is never overwritten here — only a
    // mismatch failure (validation_identity) can surface drift.
    if (outcome.observedSku !== undefined) {
      await pinTrackedProductSku(db, target.id, outcome.observedSku);
    }
    await input.hooks?.onTargetDone?.();
  }
  // Retried rows are exactly the non-final attempts of failed-then-recovered
  // or failed chains: total attempts minus one final row per target.
  const retriedAttempts = totalAttempts - input.targets.length;
  await completeScrapeRun(db, runId, {
    successCount: succeeded,
    retriedCount: retriedAttempts,
    failureCount: failed,
  });
  return { succeeded, failed, retriedAttempts, totalAttempts };
}

/**
 * Run every target independently. One product's failure never stops the
 * batch (assignment requirement); the run row carries the aggregate counts.
 * Synchronous convenience wrapper (manual/track/multi-option paths); the
 * scheduled dispatcher persists the run first via createScrapeRun +
 * executeScrapeRun so it can reply before the batch finishes.
 */
export async function runAllTargets(
  db: Queryable,
  input: {
    triggerType: string;
    targets: TargetInput[];
    scrape: ScrapeFn;
    sleep?: Sleep;
    hooks?: RunHooks;
  },
): Promise<BatchSummary> {
  const run = await createScrapeRun(db, {
    triggerType: input.triggerType,
    targetCount: input.targets.length,
  });
  const summary = await executeScrapeRun(db, run.id, {
    targets: input.targets,
    scrape: input.scrape,
    sleep: input.sleep,
    hooks: input.hooks,
  });
  return { runId: run.id, ...summary };
}
