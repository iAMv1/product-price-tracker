#!/usr/bin/env node
/**
 * Phase 1 (STORE-001) discovery tool.
 *
 * The storefront returned an empty HTML shell, which means the product data is
 * fetched by JavaScript. This script finds out what that JavaScript does:
 *
 *   1. Fetch the shell and save it verbatim.
 *   2. List every script/style asset the shell references.
 *   3. Fetch those assets, save them, and scan them for API path literals.
 *   4. Report candidate endpoints, ranked, without calling any of them.
 *
 * It is read-only: it only issues GETs against the store's own origin and writes
 * captured bytes into tests/fixtures/raw/ so the parser can be tested against
 * real responses instead of invented ones.
 *
 * Usage:
 *   node backend/tools/discover-store.mjs
 *   STORE_URL=https://example.com node backend/tools/discover-store.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(HERE, '..', 'tests', 'fixtures', 'raw');

const BASE = (process.env['STORE_URL'] ?? 'https://demo.inelabteamdev.com').replace(/\/$/, '');
const MAX_ASSETS = 25;
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

const ORIGIN = new URL(BASE).origin;

async function get(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      accept: '*/*',
      'user-agent': 'ine-price-tracker-discovery/0.1 (read-only probe)',
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();

  return { url: response.url, status: response.status, contentType, body };
}

function saveNameFor(url) {
  const { pathname } = new URL(url);
  const trimmed = pathname.replace(/^\/+/, '');
  if (trimmed === '') return 'index.html';
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function extractAssets(html) {
  const found = new Set();
  const attributePattern = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;

  for (const match of html.matchAll(attributePattern)) {
    const raw = match[1];
    if (raw === undefined) continue;
    if (raw.startsWith('data:')) continue;
    if (!/\.(?:js|mjs|css)(?:\?|$)/i.test(raw)) continue;

    try {
      found.add(new URL(raw, BASE).toString());
    } catch {
      /* ignore unparseable references */
    }
  }

  return [...found];
}

/**
 * Pulls candidate API paths out of a bundle. Bundles are minified, so this
 * looks for the shapes a client would actually contain: quoted path literals,
 * template-literal prefixes, and the arguments of fetch/axios calls.
 */
function extractCandidatePaths(source) {
  const candidates = new Map();

  const patterns = [
    // Quoted absolute paths that mention api / product / search / store.
    /["'`](\/[a-zA-Z0-9_-]*(?:api|products?|items?|catalog|search|store|price|stock)[a-zA-Z0-9_\-/.:${}]*)/gi,
    // fetch("...") / axios.get("...") arguments.
    /(?:fetch|axios(?:\.\w+)?)\s*\(\s*["'`]([^"'`]{2,120})["'`]/gi,
    // Template-literal prefixes: `${base}/api/products`
    /["'`](https?:\/\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9_\-/.:${}]*api[a-zA-Z0-9_\-/.:${}]*)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = match[1];
      if (value === undefined) continue;
      if (value.length < 3 || value.length > 160) continue;

      const normalised = value.split('?')[0] ?? value;
      candidates.set(normalised, (candidates.get(normalised) ?? 0) + 1);
    }
  }

  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([path, hits]) => ({ path, hits }));
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  console.log(`[discover] origin: ${ORIGIN}`);
  console.log(`[discover] fixtures: ${RAW_DIR}\n`);

  const shell = await get(BASE + '/');
  await writeFile(join(RAW_DIR, 'store-shell.html'), shell.body, 'utf8');

  console.log('--- 1. shell -------------------------------------------------');
  console.log(`status       : ${shell.status}`);
  console.log(`content-type : ${shell.contentType}`);
  console.log(`bytes        : ${shell.body.length}`);
  console.log(`final url    : ${shell.url}`);

  const assets = extractAssets(shell.body);
  console.log(`assets found : ${assets.length}`);
  for (const asset of assets) console.log(`  ${asset}`);

  if (assets.length === 0) {
    console.log('\nNo script/style assets were referenced. The shell may inline');
    console.log('everything, or may be blocking non-browser clients.');
    console.log('Shell head:\n');
    console.log(shell.body.slice(0, 2000));
    return;
  }

  console.log('\n--- 2. bundle scan -------------------------------------------');

  const apiPaths = new Map();
  let scanned = 0;

  for (const asset of assets.slice(0, MAX_ASSETS)) {
    let assetResponse;
    try {
      assetResponse = await get(asset);
    } catch (error) {
      console.log(`  SKIP ${asset} (${error instanceof Error ? error.message : 'error'})`);
      continue;
    }

    if (assetResponse.body.length > MAX_BYTES) {
      console.log(`  SKIP ${asset} (${assetResponse.body.length} bytes, over cap)`);
      continue;
    }

    const name = saveNameFor(assetResponse.url);
    await writeFile(join(RAW_DIR, name), assetResponse.body, 'utf8');
    scanned += 1;

    const candidates = extractCandidatePaths(assetResponse.body);
    for (const candidate of candidates) {
      apiPaths.set(
        candidate.path,
        (apiPaths.get(candidate.path) ?? 0) + candidate.hits,
      );
    }

    console.log(
      `  ${assetResponse.status}  ${String(assetResponse.body.length).padStart(8)} B  ` +
        `${String(candidates.length).padStart(3)} candidate paths  ${name}`,
    );
  }

  console.log(`\nscanned ${scanned} asset(s), saved into ${RAW_DIR}`);

  console.log('\n--- 3. candidate endpoints (ranked, not called) ---------------');
  const ranked = [...apiPaths.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    console.log('No API path literals found in the bundles.');
    console.log('Next: inspect the saved bundle by hand, or check for a');
    console.log('different data source (embedded JSON, websocket, GraphQL).');
  }
  for (const [path, hits] of ranked.slice(0, 60)) {
    console.log(`  ${String(hits).padStart(3)}x  ${path}`);
  }

  console.log('\nNext step: call the most plausible search endpoint by hand and');
  console.log('save the response as a fixture before writing any parser.');
}

main().catch((error) => {
  console.error('[discover] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
