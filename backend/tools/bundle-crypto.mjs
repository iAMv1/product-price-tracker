#!/usr/bin/env node
/**
 * Phase 1 (STORE-001): run the bundle's OWN crypto functions.
 *
 * The handshake reimplementation returned 401, which could mean either a
 * transcription error or a wrong interpretation. This removes the first
 * possibility entirely: it extracts the contiguous region of the bundle holding
 * `mr`, `dr`, `vr`, `_r`, `br`, `yr`, `xr`, `Cr` and `wr`, evaluates it with a
 * `P` stub backed by the decoded string table, and then drives the handshake
 * with the storefront's own code.
 *
 * If this succeeds, the earlier failure was a transcription bug. If it still
 * fails, the interpretation is wrong somewhere and the fault is not arithmetic.
 *
 * Run: node backend/tools/bundle-crypto.mjs [itemId] [optionId]
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(HERE, '..', 'tests', 'fixtures', 'raw');

const BASE = (process.env['STORE_URL'] ?? 'https://demo.inelabteamdev.com').replace(/\/$/, '');
const ITEM_ID = process.argv[2] ?? '2626';
const OPTION_ID = process.argv[3] ?? 'o1';

/**
 * Exact transcription of `ir` from the bundle. It returns a SIXTEEN character
 * hex hash, not 32 and not a sha256. The fingerprint's canvas and gl fields are
 * built from it, so emitting a 32-char value makes `att` malformed and the
 * server rejects the whole handshake.
 */
function ir(input) {
  let a = 2166136261;
  let b = 16777619;
  for (let i = 0; i < input.length; i += 1) {
    a ^= input.charCodeAt(i);
    a = Math.imul(a, 16777619);
    b ^= input.charCodeAt(input.length - 1 - i);
    b = Math.imul(b, 2246822507);
  }
  return (
    (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
  ).slice(0, 16);
}

async function loadBundle() {
  const entries = await readdir(RAW_DIR);
  const match = entries.find((name) => /^assets_index-.*\.js$/.test(name));
  if (match === undefined) throw new Error(`No bundle in ${RAW_DIR}.`);
  return readFile(join(RAW_DIR, match), 'utf8');
}

async function loadTable() {
  const raw = await readFile(join(RAW_DIR, 'decoded_strings.json'), 'utf8');
  return JSON.parse(raw);
}

function buildApi(source, table) {
  // `dr`, the SHA-256 round constants and the rotr helper are declared in a var
  // chain just before `mr`, so the region has to start at `var dr=`, not at mr.
  const mrIndex = source.indexOf('function mr(');
  const start = source.lastIndexOf('var dr=', mrIndex);
  const end = source.indexOf('var Tr=class');
  if (mrIndex === -1 || start === -1 || end === -1) throw new Error('crypto region not found');
  const region = source.slice(start, end);

  const P = (index) => table[String(index)];

  // The region declares everything it needs with function/var, so it can be
  // evaluated as a function body with only its globals supplied.
  const factory = new Function(
    'P',
    'atob',
    'TextEncoder',
    'TextDecoder',
    'WebAssembly',
    `${region}
     return { mr, dr, vr, br, yr, xr, Cr, wr, _r, gr };`,
  );

  return factory(P, atob, TextEncoder, TextDecoder, WebAssembly);
}

function synthesizeHoverSnapshot() {
  const now = Date.now();
  const hoverAt = now - 3000;
  const moves = [];
  let x = 640;
  let y = 470;
  for (let i = 0; i < 40; i += 1) {
    x = Math.min(1180, Math.max(560, x + (((i * 37) % 23) - 11)));
    y = Math.min(540, Math.max(455, y + (((i * 53) % 17) - 8)));
    moves.push([x, y, hoverAt + i * 65]);
  }
  return { hoverAt, dwellMs: now - hoverAt, moves, clickAt: now, trusted: true };
}

async function main() {
  const source = await loadBundle();
  const table = await loadTable();
  const api = buildApi(source, table);

  console.log('[bundle] api built from the bundle itself');
  console.log(`[bundle] dr = ${api.dr}`);
  console.log(`[bundle] dr length = ${api.dr.length}`);

  const challengeResponse = await fetch(`${BASE}/api/v2/handshake`, {
    headers: { accept: 'application/json' },
  });
  const challenge = await challengeResponse.json();
  console.log(
    `\n[bundle] challenge: salt=${challenge.salt} difficulty=${challenge.difficulty} wasm=${challenge.wasm?.length} csig=${String(challenge.csig).slice(0, 16)}...`,
  );

  const snapshot = synthesizeHoverSnapshot();
  const att = JSON.stringify({
    env: {
      canvas: ir('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANwAAAA8CAYAAAA'),
      gl: ir('Google Inc. (Intel)|ANGLE (Intel, Intel(R) UHD Graphics)|WebGL 1.0'),
      hc: 8,
      scr: [1920, 1080, 1],
      frames: [16.6, 16.7, 16.6, 16.8, 16.7, 16.6, 16.7, 16.6],
      at: Date.now(),
    },
    ix: snapshot,
  });

  const c = api._r(att);
  const seed = api.br(challenge.salt, c);
  const wasmOut = await api.Cr(challenge.wasm, seed);
  const nonce = api.xr(challenge.salt, challenge.difficulty);
  const derived = api.yr(challenge.salt, wasmOut, c);

  console.log(`[bundle] c       = ${c}`);
  console.log(`[bundle] seed    = ${seed}`);
  console.log(`[bundle] wasmOut = ${wasmOut}`);
  console.log(`[bundle] nonce   = ${nonce}`);
  console.log(`[bundle] derived = ${derived}`);
  console.log(`[bundle] pow ok  = ${api._r(`${challenge.salt}:${nonce}`).slice(0, challenge.difficulty)}`);

  const verify = await fetch(`${BASE}/api/v2/handshake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...challenge,
      nonce,
      derived,
      wasmOut,
      att,
      // The client sends the numeric productId prop, not a string.
      itemId: Number(ITEM_ID),
      option: OPTION_ID,
    }),
  });

  console.log(`\n[bundle] POST /api/v2/handshake -> ${verify.status}`);
  const text = await verify.text();
  console.log(`[bundle] body: ${text.slice(0, 300)}`);

  if (!verify.ok) {
    console.log('\n--- verdict ------------------------------------------------');
    console.log('Rejected even when driven by the bundle\'s own arithmetic, so the');
    console.log('failure is interpretive, not a transcription error. The remaining');
    console.log('suspects are the fingerprint contents and the challenge signature.');
    return;
  }

  const { pass } = JSON.parse(text);
  console.log(`[bundle] pass = ${pass.slice(0, 20)}...`);

  const quote = await fetch(
    `${BASE}/api/v2/items/${ITEM_ID}/quote?opt=${encodeURIComponent(OPTION_ID)}`,
    { headers: { Authorization: `Bearer ${pass}`, accept: 'application/json' } },
  );
  console.log(`[bundle] GET quote -> ${quote.status}`);
  const quoteText = await quote.text();
  if (!quote.ok) {
    console.log(quoteText.slice(0, 300));
    return;
  }

  const { blob } = JSON.parse(quoteText);
  const decoded = api.wr(blob, pass);
  console.log('\n[bundle] decoded quote:');
  console.log(JSON.stringify(decoded, null, 2));
  console.log('\n--- verdict: PASS — price decoded via the bundle\'s own code ---');
}

main().catch((error) => {
  console.error('[bundle] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
