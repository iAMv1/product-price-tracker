import { describe, expect, it } from 'vitest';
import type { Queryable } from '../src/persistence/db.js';
import {
  createTrackedProduct,
  createScrapeRun,
  getAttemptLog,
  getExportRows,
  getHistory,
  getLatestValidated,
} from '../src/persistence/repositories.js';
import { backoffMs, MAX_ATTEMPTS } from '../src/scraper/retry.js';
import {
  rowToTarget,
  runAllTargets,
  runTarget,
  type ScrapeFn,
  type TargetInput,
} from '../src/scraper/runner.js';
import type { ScrapeResult } from '../src/scraper/store/types.js';
import { createSchemaDb, createTestQueryable } from './helpers/pgmem.js';

function setup() {
  const db = createSchemaDb();
  return createTestQueryable(db);
}

async function seedTarget(
  db: Queryable,
  insert: {
    storeProductId?: string;
    productName?: string;
    selectedOption?: string;
    productUrl?: string;
  } = {},
): Promise<TargetInput> {
  const row = await createTrackedProduct(db, {
    storeProductId: insert.storeProductId ?? '2626',
    productName: insert.productName ?? 'Redwick Ukulele Nano',
    selectedOption: insert.selectedOption ?? 'o1',
    productUrl:
      insert.productUrl ?? 'https://demo.inelabteamdev.com/item/2626',
  });
  return rowToTarget(row);
}

async function seedRun(db: Queryable): Promise<string> {
  const run = await createScrapeRun(db, { triggerType: 'manual', targetCount: 1 });
  return run.id;
}

function scripted(results: ScrapeResult[]): { scrape: ScrapeFn; calls: number } {
  let calls = 0;
  const api = {
    calls: 0,
    scrape: (_input: { productId: string }): Promise<ScrapeResult> => {
      calls += 1;
      api.calls = calls;
      const next = results[Math.min(calls - 1, results.length - 1)];
      if (next === undefined) throw new Error('script exhausted');
      return Promise.resolve(next);
    },
  };
  return api;
}

const success: ScrapeResult = {
  ok: true,
  productId: '2626',
  productName: 'Redwick Ukulele Nano',
  selectedOption: 'o1',
  price: 62549,
  stock: '164',
  durationMs: 500,
  fetchStrategy: 'http',
  parserVersion: 'store-handshake-v1',
};

function transientFailure(
  code: 'http_5xx' | 'http_429' | 'timeout' = 'http_5xx',
): ScrapeResult {
  return {
    ok: false,
    productId: '2626',
    selectedOption: 'o1',
    errorCode: code,
    errorMessage: 'boom',
    durationMs: 100,
    transient: true,
  };
}

const terminalFailure: ScrapeResult = {
  ok: false,
  productId: '2626',
  selectedOption: 'o9',
  errorCode: 'option_not_found',
  errorMessage: 'not listed',
  durationMs: 100,
  transient: false,
};

function sleepRecorder() {
  const calls: number[] = [];
  return {
    calls,
    sleep: (ms: number): Promise<void> => {
      calls.push(ms);
      return Promise.resolve();
    },
  };
}

/** Every retried row must have a higher-attempt follower (same run+target). */
async function assertRetriedNeverFinal(
  db: Queryable,
  trackedProductId: string,
): Promise<void> {
  const log = await getAttemptLog(db, trackedProductId, 100);
  const numbers = new Set(log.map((row) => row.attempt_number));
  for (const row of log) {
    if (row.outcome === 'retried') {
      expect(
        [...numbers].some((n) => n > row.attempt_number),
        `retried attempt ${row.attempt_number} has no follower`,
      ).toBe(true);
    }
  }
}

describe('retry policy (SCRAPE-002)', () => {
  it('backs off linearly with bounded jitter', () => {
    expect(backoffMs(1, () => 0)).toBe(300);
    expect(backoffMs(2, () => 0)).toBe(600);
    expect(backoffMs(1, () => 0.999)).toBeLessThan(400);
    expect(MAX_ATTEMPTS).toBe(3);
  });
});

describe('runTarget (SCRAPE-002)', () => {
  it('persists first-try success with its history twin, no sleep', async () => {
    const db = setup();
    const target = await seedTarget(db);
    const runId = await seedRun(db);
    const { scrape } = scripted([success]);
    const recorder = sleepRecorder();

    const outcome = await runTarget(db, runId, target, scrape, recorder.sleep);
    expect(outcome).toMatchObject({ finalOutcome: 'success', attempts: 1 });
    expect(recorder.calls).toEqual([]);

    const log = await getAttemptLog(db, target.id, 10);
    expect(log.length).toBe(1);
    expect(log[0]).toMatchObject({ outcome: 'success', attempt_number: 1 });
    expect(log[0]?.price).not.toBeNull();
    const history = await getHistory(db, target.id, 10);
    expect(history.length).toBe(1);
    expect(String(history[0]?.price)).toBe(String(62549));
    expect(await getLatestValidated(db, target.id)).not.toBeNull();
  });

  it('retries transient failures then records the recovery chain', async () => {
    const db = setup();
    const target = await seedTarget(db);
    const runId = await seedRun(db);
    const { scrape } = scripted([
      transientFailure(),
      transientFailure('http_429'),
      success,
    ]);
    const recorder = sleepRecorder();

    const outcome = await runTarget(db, runId, target, scrape, recorder.sleep);
    expect(outcome).toMatchObject({ finalOutcome: 'success', attempts: 3 });
    expect(recorder.calls.length).toBe(2);

    const log = await getAttemptLog(db, target.id, 10);
    const outcomes = [...log].reverse().map((row) => row.outcome);
    expect(outcomes).toEqual(['retried', 'retried', 'success']);
    for (const row of log) {
      if (row.outcome !== 'success') {
        expect(row.price).toBeNull();
        expect(row.stock).toBeNull();
      }
    }
    await assertRetriedNeverFinal(db, target.id);
    expect((await getHistory(db, target.id, 10)).length).toBe(1);
  });

  it('ends an always-transient target as retried,retried,failed', async () => {
    const db = setup();
    const target = await seedTarget(db);
    const runId = await seedRun(db);
    const { scrape } = scripted([
      transientFailure(),
      transientFailure(),
      transientFailure(),
      transientFailure(),
    ]);
    const recorder = sleepRecorder();

    const outcome = await runTarget(db, runId, target, scrape, recorder.sleep);
    expect(outcome).toMatchObject({ finalOutcome: 'failed', attempts: 3 });
    // No fourth attempt: budget exhausted, last row is failed, not retried.
    expect(recorder.calls.length).toBe(2);

    const log = await getAttemptLog(db, target.id, 10);
    expect([...log].reverse().map((row) => row.outcome)).toEqual([
      'retried',
      'retried',
      'failed',
    ]);
    await assertRetriedNeverFinal(db, target.id);
    expect((await getHistory(db, target.id, 10)).length).toBe(0);
    expect(await getLatestValidated(db, target.id)).toBeNull();
  });

  it('fails terminal failures immediately without sleep or history', async () => {
    const db = setup();
    const target = await seedTarget(db);
    const runId = await seedRun(db);
    const { scrape } = scripted([terminalFailure]);
    const recorder = sleepRecorder();

    const outcome = await runTarget(db, runId, target, scrape, recorder.sleep);
    expect(outcome).toMatchObject({ finalOutcome: 'failed', attempts: 1 });
    expect(recorder.calls).toEqual([]);
    const log = await getAttemptLog(db, target.id, 10);
    expect(log.length).toBe(1);
    expect(log[0]?.outcome).toBe('failed');
  });

  it('never overwrites the latest known-good observation with failure', async () => {
    const db = setup();
    const target = await seedTarget(db);
    const goodRun = await seedRun(db);
    await runTarget(db, goodRun, target, scripted([success]).scrape, sleepRecorder().sleep);
    const before = await getLatestValidated(db, target.id);
    expect(before).not.toBeNull();

    const badRun = await seedRun(db);
    await runTarget(
      db,
      badRun,
      target,
      scripted([terminalFailure]).scrape,
      sleepRecorder().sleep,
    );
    expect(await getLatestValidated(db, target.id)).toEqual(before);
    expect((await getHistory(db, target.id, 10)).length).toBe(1);
  });

  it('turns an escaping throw into an honest internal_error row', async () => {
    const db = setup();
    const target = await seedTarget(db);
    const runId = await seedRun(db);
    const outcome = await runTarget(
      db,
      runId,
      target,
      () => Promise.reject(new Error('programmer error')),
      sleepRecorder().sleep,
    );
    expect(outcome).toMatchObject({ finalOutcome: 'failed', attempts: 1 });
    const log = await getAttemptLog(db, target.id, 10);
    expect(log[0]).toMatchObject({
      outcome: 'failed',
      error_code: 'internal_error',
    });
  });
});

describe('runAllTargets (SCRAPE-002)', () => {
  it('continues past one product failure and completes the run', async () => {
    const db = setup();
    const t2 = await seedTarget(db, {
      selectedOption: 'o2',
    });
    const t3 = await seedTarget(db, {
      selectedOption: 'o3',
    });

    const byOption: Record<string, ScrapeResult[]> = {
      o1: [success],
      o2: [terminalFailure],
      o3: [transientFailure(), { ...success, selectedOption: 'o3' }],
    };
    const scrape: ScrapeFn = (input) => {
      const script = byOption[input.selectedOption] ?? [terminalFailure];
      const next = script.shift() ?? terminalFailure;
      return Promise.resolve(next);
    };

    const summary = await runAllTargets(db, {
      triggerType: 'scheduled',
      targets: [t2, t3].map((t) => t),
      scrape,
      sleep: sleepRecorder().sleep,
    });
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    // o3: retried + success = 2 attempts; o2: 1 failed. Total 3, one retried.
    expect(summary.totalAttempts).toBe(3);
    expect(summary.retriedAttempts).toBe(1);

    // The t2 failure did not stop t3 from running.
    expect((await getAttemptLog(db, t3.id, 10)).length).toBe(2);

    // Export reconciles: one row per attempt, non-success rows empty.
    const exported = await getExportRows(db);
    expect(exported.length).toBe(3);
    for (const row of exported) {
      if (row.outcome !== 'success') {
        expect(row.price).toBeNull();
        expect(row.stock).toBeNull();
      }
    }
    await assertRetriedNeverFinal(db, t3.id);
  });
});
