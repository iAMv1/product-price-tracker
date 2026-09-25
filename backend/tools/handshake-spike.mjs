#!/usr/bin/env node
/**
 * Phase 1 (STORE-001) spike: reproduce the storefront's price handshake in Node.
 *
 * Recovered from the bundle (see decoded_strings.json and OBS-20260925-004):
 *
 *   GET  /api/v2/handshake                      -> { wasm, salt, difficulty, ... }
 *   fingerprint  att  = JSON({env:{canvas,gl,hc,scr,frames,at}, ix})
 *                c    = hex(sha256(att))
 *                seed = int32(hex(sha256(dr + "|seed|" + salt + "|" + c))[0..8])
 *                l    = wasm.exports.f(seed) | 0
 *                u    = first nonce where hex(sha256(salt + ":" + n))[0..difficulty] == "0"*difficulty
 *                d    = hex(sha256(dr + "|derive|" + salt + "|" + l + "|" + c))
 *   POST /api/v2/handshake  { ...challenge, nonce:u, derived:d, wasmOut:l, att, itemId, option }
 *                                                            -> { pass }
 *   GET  /api/v2/items/<id>/quote?opt=<option>   Authorization: Bearer <pass>
 *                                                            -> { blob }
 *                price/stock = XOR-decode(blob, sha256(dr + "|enc|" + pass))
 *
 * `mr` in the bundle is SHA-256 (it carries the 64 round constants and a rotr
 * helper), so node:crypto replaces it. The WASM module arrives inside the
 * challenge, so it needs no extraction.
 *
 * Run: node backend/tools/handshake-spike.mjs [itemId] [optionId]
 */

import { createHash } from 'node:crypto';

const BASE = (process.env['STORE_URL'] ?? 'https://demo.inelabteamdev.com').replace(/\/$/, '');
const ITEM_ID = process.argv[2] ?? '2626';
const OPTION_ID = process.argv[3] ?? 'o1';

/** Assembled from the decoded string table: P(232)+P(295)+P(166)+... */
const DR = 'feffd924900aae681d40425da2e3f3ef53e3ab0a8c2e6acd330b5265f3794b56';

const sha256Bytes = (input) => createHash('sha256').update(input).digest();
const sha256Hex = (input) => createHash('sha256').update(input).digest('hex');

/** `_r` in the bundle: hex of sha256 of the UTF-8 bytes of a string. */
const _r = (value) => sha256Hex(Buffer.from(value, 'utf8'));

/** `br`: seed int for the WASM call. */
function br(salt, c) {
  return (parseInt(_r(`${DR}|seed|${salt}|${c}`).slice(0, 8), 16) | 0) >>> 0;
}

/** `yr`: the derived value sent back for verification. */
function yr(salt, l, c) {
  return _r(`${DR}|derive|${salt}|${l | 0}|${c}`);
}

/** `xr`: hashcash-style proof of work. */
function solvePow(salt, difficulty) {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  for (;;) {
    if (_r(`${salt}:${nonce}`).slice(0, difficulty) === target) return nonce;
    nonce += 1;
  }
}

/** `Cr`: compile the challenge-supplied WASM and call its `f` export. */
async function callWasm(wasmBase64, seed) {
  const bytes = Buffer.from(wasmBase64, 'base64');
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module);
  const fn = instance.exports.f;
  if (typeof fn !== 'function') {
    throw new Error(`wasm has no f export; exports = ${Object.keys(instance.exports).join(',')}`);
  }
  return fn(seed) | 0;
}

/** `wr`: decode the quote payload. */
function decodePayload(blobBase64, pass) {
  const key = sha256Bytes(Buffer.from(`${DR}|enc|${pass}`, 'utf8'));
  const data = Buffer.from(blobBase64, 'base64');
  const plain = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) {
    plain[i] = data[i] ^ key[i % key.length];
  }

  const raw = Buffer.from(plain).toString('utf8');
  const s = JSON.parse(raw);

  return {
    price: s.q,
    mrp: s.l,
    sale: s.k,
    badgePct: s.o,
    stock: s.a,
    currency: s.u,
    at: s.w,
    rating: s.h,
    ratingCount: s.hn,
    seller: s.vd,
    deliveryDays: s['292'],
    variant: s.z,
    pending: s.j === 1,
    format: s.y,
    triple: s.i % 1,
    _raw: s,
  };
}

/**
 * `cr`: the fingerprint. The bundle computes a canvas hash, a WebGL hash, the
 * hardware concurrency, the screen triple and 8 requestAnimationFrame deltas.
 * Only the hash of this value is ever sent (`c`), and the server verifies
 * `derived` against it, so the fields must be internally consistent rather than
 * genuinely browser-generated. Values here are deliberately plausible.
 */
/**
 * The hover tracker's snapshot, which the client passes as the fingerprint's
 * `ix`. Recovered shape, from the bundle:
 *
 *   new Ar({ minMoves: 8, minDwellMs: 600 })
 *   move(x, y) { if (now - lastMoveAt < 40) return; moves.push([round(x), round(y), now]) }
 *   snapshot(trusted) { return { hoverAt, dwellMs, moves, clickAt, trusted } }
 *
 * The server cannot verify that a hand moved the pointer; it can only check that
 * the telemetry is internally plausible. So this produces a snapshot that
 * satisfies the tracker's own thresholds and looks like a real dwell: moves
 * spaced at or above the 40ms throttle, monotonically increasing timestamps, a
 * dwell comfortably past 600ms, and coordinates inside a 1440x900 viewport
 * over the price area.
 */
function synthesizeHoverSnapshot() {
  const now = Date.now();
  const moveCount = 40;
  const stepMs = 65;
  const span = moveCount * stepMs;
  const hoverAt = now - span - 400;

  const moves = [];
  let x = 640;
  let y = 470;
  for (let i = 0; i < moveCount; i += 1) {
    // Wander with small, deterministic jitter rather than a straight line.
    x += ((i * 37) % 23) - 11;
    y += ((i * 53) % 17) - 8;
    x = Math.min(1180, Math.max(560, x));
    y = Math.min(540, Math.max(455, y));
    moves.push([x, y, hoverAt + i * stepMs]);
  }

  return {
    hoverAt,
    dwellMs: now - hoverAt,
    moves,
    clickAt: now,
    trusted: true,
  };
}

function fingerprint(ix) {
  const frames = [16.6, 16.7, 16.6, 16.8, 16.7, 16.6, 16.7, 16.6];
  return JSON.stringify({
    env: {
      canvas: sha256Hex('ine-canvas-probe-v1').slice(0, 32),
      gl: sha256Hex('ine-webgl-probe-v1').slice(0, 32),
      hc: 8,
      scr: [1920, 1080, 1],
      frames,
      at: Date.now(),
    },
    ix,
  });
}

async function main() {
  console.log(`[handshake] ${BASE} item=${ITEM_ID} option=${OPTION_ID}`);

  console.log('\n--- 1. GET /api/v2/handshake ---');
  const challengeResponse = await fetch(`${BASE}/api/v2/handshake`, {
    headers: { accept: 'application/json' },
  });
  console.log(`status ${challengeResponse.status} ${challengeResponse.headers.get('content-type')}`);
  if (!challengeResponse.ok) {
    console.log(await challengeResponse.text());
    throw new Error(`challenge request failed: ${challengeResponse.status}`);
  }

  const challenge = await challengeResponse.json();
  const summary = { ...challenge };
  if (typeof summary['wasm'] === 'string') {
    summary['wasm'] = `<base64 ${summary['wasm'].length} chars>`;
  }
  console.log('challenge:', JSON.stringify(summary, null, 2));

  const salt = challenge['salt'];
  const difficulty = challenge['difficulty'];
  const wasm = challenge['wasm'];
  if (typeof salt !== 'string' || typeof difficulty !== 'number' || typeof wasm !== 'string') {
    throw new Error('challenge is missing salt/difficulty/wasm');
  }

  console.log('\n--- 2. fingerprint + derive ---');
  const snapshot = synthesizeHoverSnapshot();
  const att = fingerprint(snapshot);
  const c = _r(att);
  console.log(
    `snapshot: moves=${snapshot.moves.length} dwellMs=${snapshot.dwellMs} trusted=${snapshot.trusted}`,
  );
  console.log(`att     : ${att.slice(0, 120)}...`);
  console.log(`c       : ${c}`);

  const seed = br(salt, c);
  console.log(`seed    : ${seed}`);

  const wasmOut = await callWasm(wasm, seed);
  console.log(`wasmOut : ${wasmOut}`);

  console.log(`\n--- 3. proof of work (difficulty ${difficulty}) ---`);
  const startedPow = Date.now();
  const nonce = solvePow(salt, difficulty);
  console.log(`nonce   : ${nonce}  (${Date.now() - startedPow}ms)`);
  console.log(`check   : ${_r(`${salt}:${nonce}`).slice(0, difficulty)}`);

  const derived = yr(salt, wasmOut, c);
  console.log(`derived : ${derived}`);

  console.log('\n--- 4. POST /api/v2/handshake ---');
  const body = {
    ...challenge,
    nonce,
    derived,
    wasmOut,
    att,
    itemId: ITEM_ID,
    option: OPTION_ID,
  };

  const verifyResponse = await fetch(`${BASE}/api/v2/handshake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  console.log(`status ${verifyResponse.status} ${verifyResponse.headers.get('content-type')}`);
  const verifyText = await verifyResponse.text();
  console.log(`body   : ${verifyText.slice(0, 400)}`);

  if (!verifyResponse.ok) {
    console.log('\n--- verdict ------------------------------------------------');
    console.log('FAIL — the handshake was rejected. Compare the fields above with the');
    console.log('server response to see which step it disagreed with.');
    return;
  }

  const { pass } = JSON.parse(verifyText);
  console.log(`pass   : ${typeof pass === 'string' ? `${pass.slice(0, 24)}... (${pass.length} chars)` : pass}`);

  console.log(`\n--- 5. GET /api/v2/items/${ITEM_ID}/quote?opt=${OPTION_ID} ---`);
  const quoteResponse = await fetch(
    `${BASE}/api/v2/items/${ITEM_ID}/quote?opt=${encodeURIComponent(OPTION_ID)}`,
    { headers: { Authorization: `Bearer ${pass}`, accept: 'application/json' } },
  );
  console.log(`status ${quoteResponse.status} ${quoteResponse.headers.get('content-type')}`);
  const quoteText = await quoteResponse.text();
  if (!quoteResponse.ok) {
    console.log(`body   : ${quoteText.slice(0, 400)}`);
    console.log('\n--- verdict: quote request failed ---');
    return;
  }

  const quote = JSON.parse(quoteText);
  console.log(`keys   : ${Object.keys(quote).join(', ')}`);
  if (typeof quote['blob'] !== 'string') {
    console.log(`body   : ${quoteText.slice(0, 400)}`);
    throw new Error('quote response has no blob field');
  }
  console.log(`blob   : <base64 ${quote['blob'].length} chars>`);

  console.log('\n--- 6. decode ---');
  const decoded = decodePayload(quote['blob'], pass);
  console.log(JSON.stringify(decoded, null, 2));

  console.log('\n--- verdict ------------------------------------------------');
  console.log('PASS — the handshake was reproduced in Node and the price decoded.');
}

main().catch((error) => {
  console.error('\n[handshake] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
