#!/usr/bin/env node
/**
 * Phase 1 (STORE-001): capture real storefront API responses as fixtures.
 *
 * `discover-store.mjs` found the route shapes in the JavaScript bundle:
 *
 *   GET /api/v2/listings?page=<n>&limit=<n>
 *   GET /api/v2/items/<id>
 *   GET /api/v2/ui/manifest
 *
 * This script calls them, saves the exact bytes into tests/fixtures/raw/, and
 * prints a structural summary so the parser can be designed from observed data
 * instead of guessed field names.
 *
 * Read-only. Run: node backend/tools/capture-fixtures.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(HERE, '..', 'tests', 'fixtures', 'raw');

const BASE = (process.env['STORE_URL'] ?? 'https://demo.inelabteamdev.com').replace(/\/$/, '');
const TIMEOUT_MS = 20_000;

async function get(path) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      accept: 'application/json, */*',
      'user-agent': 'ine-price-tracker-discovery/0.1 (read-only probe)',
    },
  });

  return {
    path,
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    text: await response.text(),
  };
}

function fileFor(name) {
  return join(RAW_DIR, `api_${name}`);
}

async function save(name, text) {
  await writeFile(fileFor(name), text, 'utf8');
}

function tryParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

/** Describes the shape of a value without dumping it all. */
function shape(value, depth = 0) {
  const pad = '  '.repeat(depth);
  if (value === null) return `${pad}null`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}array(empty)`;
    return `${pad}array(${value.length}) of:\n${shape(value[0], depth + 1)}`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return `${pad}object(empty)`;
    return entries
      .map(([key, entry]) => `${pad}${key}: ${shape(entry, depth + 1).trimStart()}`)
      .join('\n');
  }
  const rendered = JSON.stringify(value);
  const clipped = rendered !== undefined && rendered.length > 80
    ? `${rendered.slice(0, 77)}...`
    : String(rendered);
  return `${pad}${typeof value} ${clipped}`;
}

function report(label, response) {
  console.log(`\n--- ${label} ---------------------------------------`);
  console.log(`GET    ${response.path}`);
  console.log(`status ${response.status}   type ${response.contentType}`);
  console.log(`bytes  ${response.text.length}`);

  const parsed = tryParse(response.text);
  if (!parsed.ok) {
    console.log('body is not JSON. First 400 chars:\n');
    console.log(response.text.slice(0, 400));
    return null;
  }

  console.log('shape:');
  console.log(shape(parsed.value));
  return parsed.value;
}

/** Finds the first object in a structure that looks like a product listing. */
function findFirstItem(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findFirstItem(entry);
      if (found !== null) return found;
    }
    return null;
  }

  if (value !== null && typeof value === 'object') {
    const record = value;
    if ('id' in record || 'itemId' in record || 'slug' in record) return record;

    for (const entry of Object.values(record)) {
      const found = findFirstItem(entry);
      if (found !== null) return found;
    }
  }

  return null;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  const manifest = await get('/api/v2/ui/manifest');
  await save('v2_ui_manifest.json', manifest.text);
  report('UI manifest', manifest);

  const listings = await get('/api/v2/listings?page=1&limit=24');
  await save('v2_listings_p1_l24.json', listings.text);
  const listingsBody = report('listings (page 1, limit 24)', listings);

  // Does the API support server-side search at all? The bundle contains no
  // search parameter, so this is asked rather than assumed.
  const searched = await get('/api/v2/listings?q=laptop&page=1&limit=24');
  await save('v2_listings_search_probe.json', searched.text);
  report('listings with ?q=laptop (search-support probe)', searched);

  const item = findFirstItem(listingsBody);
  if (item === null) {
    console.log('\nCould not locate an item id in the listings response.');
    console.log('Inspect fixtures/raw/api_v2_listings_p1_l24.json by hand.');
    return;
  }

  const id = item['id'] ?? item['itemId'] ?? item['slug'];
  console.log(`\nfirst item id found in listings: ${String(id)}`);

  const detail = await get(`/api/v2/items/${encodeURIComponent(String(id))}`);
  await save(`v2_items_${String(id)}.json`, detail.text);
  report(`item detail (${String(id)})`, detail);

  console.log('\n--- full first listing object -------------------------------');
  console.log(JSON.stringify(item, null, 2).slice(0, 3000));
}

main().catch((error) => {
  console.error('[capture] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
