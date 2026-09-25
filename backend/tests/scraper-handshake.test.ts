import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DR } from '../src/scraper/store/constants.js';
import type { FetchImpl } from '../src/scraper/store/catalog.js';
import { acquireQuote } from '../src/scraper/store/handshake.js';
import { scrapeProduct } from '../src/scraper/store/scrape.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(HERE, 'fixtures', 'raw');
const ITEM_2626 = JSON.parse(
  readFileSync(resolve(RAW, 'api_v2_items_2626.json'), 'utf8'),
) as unknown;

/** Test-local blob encoder (mirror of the decoder under test). */
function encodeBlob(payload: Record<string, unknown>, pass: string): string {
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

const PASS = 'test-pass-token';
const BLOB = encodeBlob(
  { q: 47052, l: 63584, a: 0, u: 'INR', y: 'nbsp' },
  PASS,
);

/**
 * Full stub backend. Difficulty 0 solves instantly (nonce 0); the WASM call
 * is stubbed because compiling a real module needs the live challenge.
 * The crypto under test (seed/derived/decode) is all real.
 */
function stubBackend(
  overrides: {
    challengeStatus?: number;
    challengeBody?: unknown;
    verifyStatus?: number;
    verifyBody?: unknown;
    quoteStatus?: number;
    quoteBody?: unknown;
  } = {},
): FetchImpl {
  const challengeBody = overrides.challengeBody ?? {
    salt: 'test-salt',
    difficulty: 0,
    wasm: 'e30=',
  };
  const verifyBody = overrides.verifyBody ?? { pass: PASS, ttlMs: 30_000 };
  const quoteBody = overrides.quoteBody ?? { blob: BLOB };
  return (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const json = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (url.endsWith('/api/v2/handshake') && method === 'GET')
      return Promise.resolve(json(challengeBody, overrides.challengeStatus ?? 200));
    if (url.endsWith('/api/v2/handshake') && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      // itemId must be numeric on the wire (FAIL-20260925-004).
      expect(typeof body['itemId']).toBe('number');
      return Promise.resolve(json(verifyBody, overrides.verifyStatus ?? 200));
    }
    if (url.includes('/quote')) {
      const auth = (init?.headers as Record<string, string> | undefined)?.[
        'Authorization'
      ];
      expect(auth).toBe(`Bearer ${PASS}`);
      return Promise.resolve(json(quoteBody, overrides.quoteStatus ?? 200));
    }
    if (url.includes('/api/v2/items/'))
      return Promise.resolve(json(ITEM_2626));
    throw new Error(`unexpected request ${method} ${url}`);
  };
}

const stubWasm = (): Promise<number> => Promise.resolve(7);

describe('handshake client (SCRAPE-001)', () => {
  it('acquires and decodes a quote with real crypto, stubbed transport', async () => {
    const result = await acquireQuote('https://store.test', 2626, 'o1', {
      fetchImpl: stubBackend(),
      wasmImpl: stubWasm,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.quote.payload.price).toBe(47052);
    expect(result.quote.payload.stock).toBe(0);
    expect(result.quote.passTtlMs).toBe(30_000);
  });

  it('maps verify-401 to terminal handshake_drift (never retried)', async () => {
    const result = await acquireQuote('https://store.test', 2626, 'o1', {
      fetchImpl: stubBackend({ verifyStatus: 401, verifyBody: { error: 'unauthorized' } }),
      wasmImpl: stubWasm,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { errorCode: 'handshake_drift', transient: false },
    });
  });

  it('maps challenge-503 to transient and bad challenge shape to drift', async () => {
    const down = await acquireQuote('https://store.test', 2626, 'o1', {
      fetchImpl: stubBackend({ challengeStatus: 503, challengeBody: {} }),
      wasmImpl: stubWasm,
    });
    expect(down).toMatchObject({
      ok: false,
      failure: { errorCode: 'http_5xx', transient: true },
    });

    const reshaped = await acquireQuote('https://store.test', 2626, 'o1', {
      fetchImpl: stubBackend({ challengeBody: { salt: 's' } }),
      wasmImpl: stubWasm,
    });
    expect(reshaped).toMatchObject({
      ok: false,
      failure: { errorCode: 'handshake_drift', transient: false },
    });
  });

  it('maps quote-401 to transient and missing blob to drift', async () => {
    const expired = await acquireQuote('https://store.test', 2626, 'o1', {
      fetchImpl: stubBackend({ quoteStatus: 401, quoteBody: {} }),
      wasmImpl: stubWasm,
    });
    expect(expired).toMatchObject({
      ok: false,
      failure: { errorCode: 'quote_unauthorized', transient: true },
    });

    const noBlob = await acquireQuote('https://store.test', 2626, 'o1', {
      fetchImpl: stubBackend({ quoteBody: { nope: 1 } }),
      wasmImpl: stubWasm,
    });
    expect(noBlob).toMatchObject({
      ok: false,
      failure: { errorCode: 'handshake_drift', transient: false },
    });
  });
});

describe('scrapeProduct (SCRAPE-001)', () => {
  const input = {
    productId: '2626',
    selectedOption: 'o1',
    productUrl: 'https://demo.inelabteamdev.com/item/2626',
  };

  it('returns a validated observation for a tracked target', async () => {
    const result = await scrapeProduct(input, {
      baseUrl: 'https://store.test',
      fetchImpl: stubBackend(),
      wasmImpl: stubWasm,
    });
    expect(result).toMatchObject({
      ok: true,
      productId: '2626',
      productName: 'Redwick Ukulele Nano',
      selectedOption: 'o1',
      price: 47052,
      stock: '0',
      fetchStrategy: 'http',
      parserVersion: 'store-handshake-v1',
    });
  });

  it('fails safe on bad product id, unknown option, missing item', async () => {
    const badId = await scrapeProduct(
      { ...input, productId: 'abc' },
      { baseUrl: 'https://store.test', fetchImpl: stubBackend(), wasmImpl: stubWasm },
    );
    expect(badId).toMatchObject({
      ok: false,
      errorCode: 'bad_product_id',
      transient: false,
    });

    const badOption = await scrapeProduct(
      { ...input, selectedOption: 'o9' },
      { baseUrl: 'https://store.test', fetchImpl: stubBackend(), wasmImpl: stubWasm },
    );
    expect(badOption).toMatchObject({
      ok: false,
      errorCode: 'option_not_found',
      transient: false,
    });
    if (badOption.ok) throw new Error('expected failure');
    expect(badOption.errorMessage).toContain('o1,o2,o3,o4');

    const gone: FetchImpl = (url, init) => {
      if (String(url).includes('/api/v2/items/'))
        return Promise.resolve(
          new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } }),
        );
      return stubBackend()(url, init);
    };
    const missing = await scrapeProduct(input, {
      baseUrl: 'https://store.test',
      fetchImpl: gone,
      wasmImpl: stubWasm,
    });
    expect(missing).toMatchObject({
      ok: false,
      errorCode: 'item_not_found',
      transient: false,
    });
  });
});
