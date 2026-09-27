#!/usr/bin/env node
/**
 * Production smoke test — read-only by design. Proves the deployed system
 * answers, not just that it built:
 *
 *   frontend 200 → /health 200 + reachable → tracked list 200 + non-empty
 *   → search 200
 *
 * Never mutates tracking state: no POST/PATCH/DELETE anywhere in this file.
 * Exit 0 = all green, 1 = first failure with the URL that broke.
 */

const FRONTEND = process.env.SMOKE_FRONTEND_URL ?? 'https://product-price-tracker-ochre.vercel.app';
const API = process.env.SMOKE_API_URL ?? 'https://ppt-backend-lyiv.onrender.com';

async function get(path, { base = API, expect = 200 } = {}) {
  const url = `${base}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (res.status !== expect) {
    throw new Error(`${url} -> HTTP ${res.status}, expected ${expect}`);
  }
  return res;
}

const checks = [
  ['frontend serves', async () => {
    const res = await get('/', { base: FRONTEND });
    const html = await res.text();
    if (!html.includes('Price Tracker')) throw new Error('landing HTML missing brand marker');
  }],
  ['health reachable', async () => {
    const body = await (await get('/health')).json();
    if (body.status !== 'ok') throw new Error(`health status=${body.status}`);
    if (body.database !== 'reachable') throw new Error(`database=${body.database}`);
  }],
  ['tracked targets exist', async () => {
    const body = await (await get('/api/tracked-products')).json();
    if (!Array.isArray(body.results) || body.results.length === 0) {
      throw new Error('no tracked targets');
    }
  }],
  ['store search answers', async () => {
    const body = await (await get('/api/products/search?q=ukulele')).json();
    if (typeof body.count !== 'number') throw new Error('search shape changed');
  }],
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : error}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
