import { describe, expect, it } from 'vitest';
import { createSchemaDb, createTestQueryable } from './helpers/pgmem.js';
import {
  createScrapeRun,
  createTrackedProduct,
  getLatestAttempts,
  recordNonSuccessAttempt,
  recordSuccessfulAttempt,
} from '../src/persistence/repositories.js';

/**
 * getLatestAttempts must return exactly one row per target — the newest —
 * computed by the database, not by shipping the whole table to Node.
 * pg-mem runs the same anti-join SQL as production Postgres here.
 */
describe('getLatestAttempts', () => {
  it('returns the newest attempt per target, ties broken by attempt number', async () => {
    const db = createTestQueryable(createSchemaDb());
    const a = await createTrackedProduct(db, {
      storeProductId: '2626',
      productName: 'A',
      selectedOption: 'o1',
      productUrl: 'https://demo.inelabteamdev.com/item/2626',
    });
    const b = await createTrackedProduct(db, {
      storeProductId: '2229',
      productName: 'B',
      selectedOption: 'o2',
      productUrl: 'https://demo.inelabteamdev.com/item/2229',
    });
    const run = await createScrapeRun(db, { triggerType: 'manual', targetCount: 2 });

    // Target A: attempt 1 retried, attempt 2 failed — latest must be #2.
    await recordNonSuccessAttempt(db, {
      runId: run.id,
      trackedProductId: a.id,
      attemptNumber: 1,
      outcome: 'retried',
      errorCode: 'timeout',
      durationMs: 10,
    });
    await recordSuccessfulAttempt(db, {
      runId: run.id,
      trackedProductId: b.id,
      attemptNumber: 1,
      outcome: 'success',
      price: 100,
      stock: '5',
      durationMs: 10,
    });
    await new Promise((r) => setTimeout(r, 5));
    await recordNonSuccessAttempt(db, {
      runId: run.id,
      trackedProductId: a.id,
      attemptNumber: 2,
      outcome: 'failed',
      errorCode: 'http_5xx',
      durationMs: 10,
    });

    const latest = await getLatestAttempts(db);
    expect(latest).toHaveLength(2);
    const byTarget = new Map(latest.map((r) => [r.trackedProductId, r]));
    expect(byTarget.get(a.id)).toMatchObject({ outcome: 'failed', errorCode: 'http_5xx' });
    expect(byTarget.get(b.id)).toMatchObject({ outcome: 'success' });
  });
});
