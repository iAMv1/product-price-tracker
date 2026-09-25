import type { Queryable } from '../persistence/db.js';
import {
  completeScrapeRun,
  createScrapeRun,
  recordNonSuccessAttempt,
  recordSuccessfulAttempt,
  type TrackedProductRow,
} from '../persistence/repositories.js';
import { backoffMs, MAX_ATTEMPTS, realSleep, type Sleep } from './retry.js';
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
}

export function rowToTarget(row: TrackedProductRow): TargetInput {
  return {
    id: row.id,
    storeProductId: row.store_product_id,
    productName: row.product_name,
    selectedOption: row.selected_option,
    productUrl: row.product_url,
  };
}

export type ScrapeFn = (input: ScrapeInput) => Promise<ScrapeResult>;

export interface TargetOutcome {
  targetId: string;
  finalOutcome: 'success' | 'failed';
  attempts: number;
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
): Promise<TargetOutcome> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let result: ScrapeResult;
    try {
      result = await scrape({
        productId: target.storeProductId,
        selectedOption: target.selectedOption,
        productUrl: target.productUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordNonSuccessAttempt(db, {
        runId,
        trackedProductId: target.id,
        attemptNumber: attempt,
        outcome: 'failed',
        errorCode: 'internal_error',
        errorMessage: `scraper threw instead of returning a failure: ${message}`,
      });
      return { targetId: target.id, finalOutcome: 'failed', attempts: attempt };
    }

    if (result.ok) {
      await recordSuccessfulAttempt(db, {
        runId,
        trackedProductId: target.id,
        attemptNumber: attempt,
        outcome: 'success',
        price: result.price,
        stock: result.stock,
        durationMs: result.durationMs,
      });
      return { targetId: target.id, finalOutcome: 'success', attempts: attempt };
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
    return { targetId: target.id, finalOutcome: 'failed', attempts: attempt };
  }
  // Unreachable: the loop always returns on its last iteration.
  throw new Error('runTarget exhausted attempts without returning');
}

export interface BatchSummary {
  runId: string;
  succeeded: number;
  failed: number;
  retriedAttempts: number;
  totalAttempts: number;
}

/**
 * Run every target independently. One product's failure never stops the
 * batch (assignment requirement); the run row carries the aggregate counts.
 */
export async function runAllTargets(
  db: Queryable,
  input: {
    triggerType: string;
    targets: TargetInput[];
    scrape: ScrapeFn;
    sleep?: Sleep;
  },
): Promise<BatchSummary> {
  const sleep = input.sleep ?? realSleep;
  const run = await createScrapeRun(db, {
    triggerType: input.triggerType,
    targetCount: input.targets.length,
  });

  let succeeded = 0;
  let failed = 0;
  let totalAttempts = 0;
  for (const target of input.targets) {
    const outcome = await runTarget(db, run.id, target, input.scrape, sleep);
    totalAttempts += outcome.attempts;
    if (outcome.finalOutcome === 'success') succeeded += 1;
    else failed += 1;
  }
  // Retried rows are exactly the non-final attempts of failed-then-recovered
  // or failed chains: total attempts minus one final row per target.
  const retriedAttempts = totalAttempts - input.targets.length;
  await completeScrapeRun(db, run.id, {
    successCount: succeeded,
    retriedCount: retriedAttempts,
    failureCount: failed,
  });
  return {
    runId: run.id,
    succeeded,
    failed,
    retriedAttempts,
    totalAttempts,
  };
}
