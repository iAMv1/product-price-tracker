#!/usr/bin/env tsx
/**
 * SCRAPE-001 live verification (L4): run the ported scraper against the real
 * mock store and print the typed result. Offline suite proves structure;
 * THIS run proves the transcription is correct (crypto right, field shapes
 * right, constants live).
 *
 * Run: npx tsx backend/tools/live-verify-scrape.ts [itemId] [option]
 * Do NOT run in CI — hits the live storefront.
 */
import { scrapeProduct } from '../src/scraper/store/index.js';
import { STORE_BASE_URL } from '../src/scraper/store/constants.js';

const ITEM_ID = process.argv[2] ?? '2626';
const OPTION = process.argv[3] ?? 'o1';

const started = Date.now();
const result = await scrapeProduct({
  productId: ITEM_ID,
  selectedOption: OPTION,
  productUrl: `${STORE_BASE_URL}/item/${ITEM_ID}`,
});
const wallMs = Date.now() - started;

if (result.ok) {
  console.log(
    JSON.stringify(
      {
        verdict: 'PASS',
        productId: result.productId,
        productName: result.productName,
        selectedOption: result.selectedOption,
        price: result.price,
        stock: result.stock,
        durationMs: result.durationMs,
        wallMs,
        fetchStrategy: result.fetchStrategy,
        parserVersion: result.parserVersion,
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    JSON.stringify(
      {
        verdict: 'FAIL',
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        transient: result.transient,
        durationMs: result.durationMs,
        wallMs,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
