#!/usr/bin/env node
/**
 * Phase 1 (STORE-001): locate the price/stock endpoint.
 *
 * The catalog endpoints are plain literals in the bundle:
 *   GET /api/v2/listings?page=&limit=
 *   GET /api/v2/items/<id>
 *   GET /api/v2/ui/manifest
 *
 * But neither listings nor items contains a price or a stock value. The bundle
 * shows price arriving as a base64 payload that is XOR-decoded client-side, and
 * the endpoint it is fetched from is a runtime-decrypted string constant, not a
 * literal. So the path cannot be grepped out; it has to be discovered.
 *
 * This probes plausible shapes under the known /api/v2 namespace. Read-only GETs.
 *
 * Run: node backend/tools/probe-price-endpoint.mjs
 */

const BASE = (process.env['STORE_URL'] ?? 'https://demo.inelabteamdev.com').replace(/\/$/, '');
const TIMEOUT_MS = 15_000;

const ITEM_ID = '2626';
const ITEM_SLUG = 'redwick-ukulele-nano';
const SKU = 'SK-2626-RE';

const CANDIDATES = [
  `/api/v2/items/${ITEM_ID}/price`,
  `/api/v2/items/${ITEM_ID}/pricing`,
  `/api/v2/items/${ITEM_ID}/offer`,
  `/api/v2/items/${ITEM_ID}/offers`,
  `/api/v2/items/${ITEM_ID}/quote`,
  `/api/v2/items/${ITEM_ID}/stock`,
  `/api/v2/items/${ITEM_ID}/availability`,
  `/api/v2/items/${ITEM_ID}/inventory`,
  `/api/v2/items/${ITEM_ID}/variants`,
  `/api/v2/items/${ITEM_ID}/options`,
  `/api/v2/items/${ITEM_ID}/detail`,
  `/api/v2/prices/${ITEM_ID}`,
  `/api/v2/pricing/${ITEM_ID}`,
  `/api/v2/offers/${ITEM_ID}`,
  `/api/v2/stock/${ITEM_ID}`,
  `/api/v2/variants/${ITEM_ID}`,
  `/api/v2/items/${ITEM_SLUG}/price`,
  `/api/v2/items/${ITEM_SLUG}/offers`,
  `/api/v2/items/by-slug/${ITEM_SLUG}`,
  `/api/v2/skus/${SKU}`,
  `/api/v2/skus/${SKU}/price`,
  `/api/v2/items/${ITEM_ID}?include=price`,
  `/api/v2/items/${ITEM_ID}?include=offers`,
  `/api/v2/items/${ITEM_ID}?expand=offers`,
  `/api/v2/items/${ITEM_ID}/price?option=o1`,
  `/api/v2/items/${ITEM_ID}/offers?option=o1`,
  `/api/v2/items/${ITEM_ID}/price?options=o1`,
  `/api/v2/ui/manifest?item=${ITEM_ID}`,
];

async function probe(path) {
  try {
    const response = await fetch(`${BASE}${path}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent': 'ine-price-tracker-discovery/0.1 (read-only probe)',
      },
    });

    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();

    return { path, status: response.status, contentType, text };
  } catch (error) {
    return {
      path,
      status: 0,
      contentType: '',
      text: error instanceof Error ? error.message : 'error',
    };
  }
}

/** A base64 body that is not JSON is exactly what the price payload looks like. */
function classify(text) {
  const trimmed = text.trim();
  if (trimmed === '') return 'empty';
  if (/^[[{]/.test(trimmed)) return 'json';
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.replace(/\s+/g, '').length > 16) {
    return 'BASE64-LIKE';
  }
  return 'other';
}

async function main() {
  console.log(`[probe] ${BASE}`);
  console.log(`[probe] ${CANDIDATES.length} candidates, read-only GETs\n`);

  const interesting = [];

  for (const path of CANDIDATES) {
    const result = await probe(path);
    const kind = classify(result.text);
    const mark = result.status === 200 ? '200' : String(result.status);

    if (result.status === 200 || kind === 'BASE64-LIKE') {
      interesting.push({ ...result, kind });
      console.log(`  ${mark}   ${kind.padEnd(12)} ${path}`);
      console.log(`        ${result.contentType}`);
      console.log(`        ${result.text.slice(0, 140).replace(/\s+/g, ' ')}`);
    } else {
      console.log(`  ${mark}   -            ${path}`);
    }
  }

  console.log('\n--- summary -------------------------------------------------');
  if (interesting.length === 0) {
    console.log('No candidate returned 200. The endpoint path is not guessable;');
    console.log('it must come from the bundle\'s decrypted string table.');
    console.log('Next: extract the obfuscated string array and its decoder, or');
    console.log('escalate to a browser, which decodes the payload for us.');
  } else {
    for (const entry of interesting) {
      console.log(`  ${entry.status} ${entry.kind} ${entry.path}`);
    }
  }
}

main().catch((error) => {
  console.error('[probe] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
