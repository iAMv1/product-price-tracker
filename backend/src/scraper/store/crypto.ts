import { createHash } from 'node:crypto';
import { DR, MAX_POW_NONCE } from './constants.js';

/**
 * Pure storefront cryptography (OBS-20260925-004). Transcribed from the bundle
 * and proven end to end in VER-20260925-002. `mr` in the bundle is plain
 * SHA-256 (all 8 IVs + 64 K constants present), so node:crypto replaces it.
 */

const sha256Bytes = (input: string | Buffer): Buffer =>
  createHash('sha256').update(input).digest();

/** `_r` in the bundle: lowercase hex of sha256 over the UTF-8 bytes. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(Buffer.from(input, 'utf8')).digest('hex');
}

/**
 * `ir` in the bundle: a custom FNV-style hash returning SIXTEEN hex chars.
 * The fingerprint's canvas/gl fields are built from it — sending 32-char
 * sha256 values makes `att` malformed and the server answers opaque 401
 * (FAIL-20260925-004). Do not "fix" the width.
 */
export function fnvHash16(input: string): string {
  let a = 2166136261;
  let b = 16777619;
  for (let i = 0; i < input.length; i += 1) {
    a ^= input.charCodeAt(i);
    a = Math.imul(a, 16777619);
    b ^= input.charCodeAt(input.length - 1 - i);
    b = Math.imul(b, 2246822507);
  }
  return (
    (a >>> 0).toString(16).padStart(8, '0') +
    (b >>> 0).toString(16).padStart(8, '0')
  ).slice(0, 16);
}

/** `br`: seed integer for the WASM call. */
export function seedFor(salt: string, fingerprintHash: string): number {
  return (
    parseInt(sha256Hex(`${DR}|seed|${salt}|${fingerprintHash}`).slice(0, 8), 16) |
    0
  ) >>> 0;
}

/** `yr`: the derived value sent back for verification. */
export function derivedFor(
  salt: string,
  wasmOut: number,
  fingerprintHash: string,
): string {
  return sha256Hex(`${DR}|derive|${salt}|${wasmOut | 0}|${fingerprintHash}`);
}

/** `xr`: hashcash-style proof of work. Throws on budget exhaustion. */
export function solveProofOfWork(
  salt: string,
  difficulty: number,
  maxNonce: number = MAX_POW_NONCE,
): number {
  const target = '0'.repeat(difficulty);
  for (let nonce = 0; nonce <= maxNonce; nonce += 1) {
    if (sha256Hex(`${salt}:${nonce}`).slice(0, difficulty) === target) {
      return nonce;
    }
  }
  throw new Error(`proof-of-work budget exhausted at nonce ${maxNonce}`);
}

/** Decoded quote payload: single-letter keys mapped to named fields. */
export interface QuotePayload {
  /** `q` — shown price, integer minor units. */
  price: number;
  /** `l` — mrp. */
  mrp?: number;
  /** `a` — stock count as the store reports it. */
  stock: number | string;
  /** `u` — currency code. */
  currency?: string;
  /** `y` — presentation format (spaced|euro|trailing|unicode|nbsp|lakh). */
  format?: string;
  /** Raw single-letter object for evidence/debugging. */
  raw: Record<string, unknown>;
}

import { isRecord } from '../../http/guards.js';

/**
 * `wr`: decode the quote blob (base64 → XOR with sha256(dr|enc|pass) → JSON).
 * Throws on any structural problem — the caller maps that to
 * `handshake_drift`, because a well-formed pass with an undecodable blob
 * means the storefront changed, not the network.
 */
export function decodeQuotePayload(
  blobBase64: string,
  pass: string,
): QuotePayload {
  const key = sha256Bytes(Buffer.from(`${DR}|enc|${pass}`, 'utf8'));
  // Buffer.from(x, 'base64') never throws: it silently clips invalid chars,
  // so garbage surfaces below as undecodable JSON instead.
  const data = Buffer.from(blobBase64, 'base64');
  if (data.length === 0 || data.length > 1_000_000) {
    throw new Error(`quote blob has implausible length ${data.length}`);
  }
  const plain = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) {
    const byte = data[i];
    const keyByte = key[i % key.length];
    if (byte === undefined || keyByte === undefined)
      throw new Error('quote blob read failed');
    plain[i] = byte ^ keyByte;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(plain.toString('utf8'));
  } catch {
    throw new Error('quote blob did not decode to JSON (storefront drift?)');
  }
  if (!isRecord(parsed)) throw new Error('quote payload is not an object');
  const price = parsed['q'];
  const stock = parsed['a'];
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    throw new Error('quote payload carries no valid price (q)');
  }
  if (
    (typeof stock !== 'number' && typeof stock !== 'string') ||
    stock === ''
  ) {
    throw new Error('quote payload carries no stock value (a)');
  }
  const payload: QuotePayload = { price, stock, raw: parsed };
  if (typeof parsed['l'] === 'number') payload.mrp = parsed['l'];
  if (typeof parsed['u'] === 'string') payload.currency = parsed['u'];
  if (typeof parsed['y'] === 'string') payload.format = parsed['y'];
  return payload;
}
