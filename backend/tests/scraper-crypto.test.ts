import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DR, MAX_POW_NONCE } from '../src/scraper/store/constants.js';
import {
  decodeQuotePayload,
  derivedFor,
  fnvHash16,
  seedFor,
  sha256Hex,
  solveProofOfWork,
} from '../src/scraper/store/crypto.js';

/** Test-local encoder: the exact inverse of decodeQuotePayload. */
function encodePayload(payload: Record<string, unknown>, pass: string): string {
  const key = createHash('sha256')
    .update(Buffer.from(`${DR}|enc|${pass}`, 'utf8'))
    .digest();
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  const cipher = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) {
    const byte = data[i];
    const keyByte = key[i % key.length];
    if (byte === undefined || keyByte === undefined)
      throw new Error('encode read failed');
    cipher[i] = byte ^ keyByte;
  }
  return cipher.toString('base64');
}

describe('store crypto (SCRAPE-001)', () => {
  it('sha256Hex matches the known SHA-256 vector', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('fnvHash16 pins the bundle transcription (16 hex, not sha256)', () => {
    // Golden values computed from the bundle-crypto.mjs transcription.
    // They pin OUR transcription against regressions; the live handshake
    // (VER-20260925-002) is what proves the transcription correct.
    expect(
      fnvHash16('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANwAAAA8CAYAAAA'),
    ).toBe('bb583ba7af0d2c81');
    expect(
      fnvHash16('Google Inc. (Intel)|ANGLE (Intel, Intel(R) UHD Graphics)|WebGL 1.0'),
    ).toBe('24e50a765074082a');
    expect(fnvHash16('x')).toMatch(/^[0-9a-f]{16}$/);
    expect(fnvHash16('x')).not.toBe(sha256Hex('x').slice(0, 16));
    expect(fnvHash16('deterministic')).toBe(fnvHash16('deterministic'));
  });

  it('seed and derived values are deterministic 8-hex-int / 64-hex', () => {
    const seed = seedFor('salt-1', 'c-hash');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed >>> 0).toBe(seed);
    expect(seedFor('salt-1', 'c-hash')).toBe(seed);
    expect(seedFor('salt-2', 'c-hash')).not.toBe(seed);
    expect(derivedFor('salt-1', 42, 'c-hash')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('solveProofOfWork finds a nonce whose hash has the prefix', () => {
    const nonce = solveProofOfWork('test-salt', 2);
    expect(sha256Hex(`test-salt:${nonce}`).slice(0, 2)).toBe('00');
  });

  it('solveProofOfWork gives up within budget', () => {
    expect(() => solveProofOfWork('test-salt', 8, 10)).toThrow(
      /budget exhausted/,
    );
  });

  it('solveProofOfWork fails a hard puzzle on the 0ms wall-clock budget', () => {
    // Difficulty 8 = 16^8 expected hashes: without a time budget this would
    // run to the 100M nonce cap (minutes of CPU). 0ms must throw before the
    // first hash, with the same error style the handshake maps to
    // `pow_budget_exhausted`.
    const startedAt = Date.now();
    expect(() => solveProofOfWork('test-salt', 8, MAX_POW_NONCE, 0)).toThrow(
      /budget exhausted/,
    );
    expect(Date.now() - startedAt).toBeLessThan(100);
  });

  it('solveProofOfWork honours a 1ms wall-clock budget quickly', () => {
    // Difficulty 10 (16^10 expected hashes) cannot be solved inside 1ms, so
    // this can only exit through the time budget.
    const startedAt = Date.now();
    expect(() => solveProofOfWork('test-salt', 10, MAX_POW_NONCE, 1)).toThrow(
      /time budget exhausted/,
    );
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  it('decodeQuotePayload round-trips and maps single-letter keys', () => {
    const blob = encodePayload(
      {
        q: 47052,
        l: 63584,
        a: 0,
        u: 'INR',
        y: 'nbsp',
        h: 4.5,
        hn: 45720,
        vd: 'Bright Harbour',
        z: 'malformed',
      },
      'test-pass',
    );
    const decoded = decodeQuotePayload(blob, 'test-pass');
    expect(decoded.price).toBe(47052);
    expect(decoded.mrp).toBe(63584);
    expect(decoded.stock).toBe(0);
    expect(decoded.currency).toBe('INR');
    expect(decoded.format).toBe('nbsp');
    expect(decoded.raw['vd']).toBe('Bright Harbour');
  });

  it('decodeQuotePayload rejects a wrong pass and garbage', () => {
    const blob = encodePayload({ q: 47052, a: 0 }, 'right-pass');
    expect(() => decodeQuotePayload(blob, 'wrong-pass')).toThrow();
    expect(() => decodeQuotePayload('!!!not-base64!!!', 'p')).toThrow();
    expect(() => decodeQuotePayload('', 'p')).toThrow();
    expect(() =>
      decodeQuotePayload(encodePayload({ q: -5, a: 0 }, 'p'), 'p'),
    ).toThrow(/no valid price/);
    expect(() =>
      decodeQuotePayload(encodePayload({ q: 10 }, 'p'), 'p'),
    ).toThrow(/no stock/);
  });
});
