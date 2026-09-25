#!/usr/bin/env tsx
/**
 * SCRAPE-002 live verification (L4): run the REAL runner against the REAL
 * store with an in-memory pg-mem database, and print the persisted evidence.
 * Proves the runner honors transient/terminal classification under genuine
 * storefront flakiness (503s happen on healthy routes) with the real
 * persistence shape (attempt rows + history twin + run counters + export).
 *
 * Run: npx tsx tools/live-verify-run.ts [itemId] [opt1] [opt2]
 * Do NOT run in CI — hits the live storefront.
 */
import { createTrackedProduct } from '../src/persistence/repositories.js';
import { getExportRows } from '../src/persistence/repositories.js';
import { rowToTarget, runAllTargets } from '../src/scraper/runner.js';
import { scrapeProduct } from '../src/scraper/store/index.js';
import { STORE_BASE_URL } from '../src/scraper/store/constants.js';
import { createSchemaDb, createTestQueryable } from '../tests/helpers/pgmem.js';

const ITEM_ID = process.argv[2] ?? '2626';
const OPTIONS = [process.argv[3] ?? 'o1', process.argv[4] ?? 'o2'];

const db = createTestQueryable(createSchemaDb());
const targets = [];
for (const option of OPTIONS) {
  const row = await createTrackedProduct(db, {
    storeProductId: ITEM_ID,
    productName: `live-item-${ITEM_ID}`,
    selectedOption: option,
    productUrl: `${STORE_BASE_URL}/item/${ITEM_ID}`,
  });
  targets.push(rowToTarget(row));
}

const summary = await runAllTargets(db, {
  triggerType: 'manual',
  targets,
  scrape: (input) => scrapeProduct(input),
});

console.log(
  JSON.stringify(
    {
      verdict: summary.failed === 0 ? 'PASS' : 'MIXED',
      ...summary,
      export: await getExportRows(db),
    },
    null,
    2,
  ),
);
if (summary.totalAttempts === 0) process.exitCode = 1;
