import {
  classifyFetchError,
  classifyHttpStatus,
  type FetchImpl,
} from './catalog.js';
import { MAX_POW_DIFFICULTY, REQUEST_TIMEOUT_MS } from './constants.js';
import {
  decodeQuotePayload,
  derivedFor,
  type QuotePayload,
  seedFor,
  solveProofOfWork,
} from './crypto.js';
import { buildFingerprint, synthesizeHoverSnapshot } from './fingerprint.js';
import type { ScrapeErrorCode } from './types.js';
import { callChallengeWasm } from './wasm.js';

/**
 * Price handshake client (OBS-20260925-004, VER-20260925-002). No browser:
 * challenge → fingerprint → PoW → WASM seed → verify → bearer quote → decode.
 * Sub-second at difficulty 3. `pass` carries ttlMs:30000, so challenge and
 * quote stay inside one call.
 */

export interface HandshakeDeps {
  fetchImpl?: FetchImpl;
  wasmImpl?: (wasmBase64: string, seed: number) => Promise<number>;
  now?: () => number;
}

export interface AcquiredQuote {
  payload: QuotePayload;
  /** Challenge-to-quote wall time; must stay under the pass TTL. */
  elapsedMs: number;
  passTtlMs: number;
}

export interface HandshakeFailure {
  errorCode: ScrapeErrorCode;
  errorMessage: string;
  transient: boolean;
}

function drift(message: string): HandshakeFailure {
  return { errorCode: 'handshake_drift', errorMessage: message, transient: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface Challenge {
  salt: string;
  difficulty: number;
  wasm: string;
  raw: Record<string, unknown>;
}

function parseChallenge(json: unknown): Challenge | HandshakeFailure {
  if (!isRecord(json)) return drift('challenge is not an object');
  const { salt, difficulty, wasm } = json;
  if (typeof salt !== 'string' || salt === '')
    return drift('challenge is missing salt');
  if (typeof difficulty !== 'number' || !Number.isInteger(difficulty) || difficulty < 0)
    return drift('challenge carries an invalid difficulty');
  if (typeof wasm !== 'string' || wasm === '')
    return drift('challenge is missing its wasm module');
  if (difficulty > MAX_POW_DIFFICULTY)
    return drift(
      `challenge difficulty ${difficulty} exceeds the supported maximum ${MAX_POW_DIFFICULTY} (storefront drift?)`,
    );
  return { salt, difficulty, wasm, raw: json };
}

async function postVerify(
  baseUrl: string,
  challenge: Challenge,
  body: Record<string, unknown>,
  fetchImpl: FetchImpl,
): Promise<{ ok: true; pass: string; ttlMs: number } | { ok: false; failure: HandshakeFailure }> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/api/v2/handshake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ ...challenge.raw, ...body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, failure: classifyFetchError(error, 'handshake verify') };
  }
  if (response.status === 401) {
    // The opaque 401 is the shape-error signal (FAIL-20260925-004): either a
    // malformed nested field or a redeployed storefront. Retrying the exact
    // same bytes cannot succeed, and hammering risks a rate limit.
    return {
      ok: false,
      failure: drift(
        'handshake verify returned 401: fingerprint shape or storefront constants no longer apply (see FAIL-20260925-004)',
      ),
    };
  }
  const statusFailure = classifyHttpStatus(response.status, 'handshake verify');
  if (statusFailure !== null) {
    if (statusFailure.errorCode === 'item_not_found')
      return { ok: false, failure: drift('handshake verify returned 404 (route moved?)') };
    return { ok: false, failure: statusFailure };
  }
  let json: unknown;
  try {
    json = (await response.json()) as unknown;
  } catch {
    return { ok: false, failure: drift('handshake verify returned non-JSON') };
  }
  if (!isRecord(json) || typeof json['pass'] !== 'string' || json['pass'] === '')
    return { ok: false, failure: drift('handshake verify returned no pass token') };
  const ttlMs = typeof json['ttlMs'] === 'number' ? json['ttlMs'] : 30_000;
  return { ok: true, pass: json['pass'], ttlMs };
}

/**
 * Full acquisition for one (item, option): challenge, PoW, WASM, verify,
 * bearer quote, decode. Throws nothing — every failure is a typed value.
 */
export async function acquireQuote(
  baseUrl: string,
  itemId: number,
  option: string,
  deps: HandshakeDeps = {},
): Promise<{ ok: true; quote: AcquiredQuote } | { ok: false; failure: HandshakeFailure }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const wasmImpl = deps.wasmImpl ?? callChallengeWasm;
  const now = deps.now ?? Date.now;
  const started = now();

  let challengeResponse: Response;
  try {
    challengeResponse = await fetchImpl(`${baseUrl}/api/v2/handshake`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, failure: classifyFetchError(error, 'handshake challenge') };
  }
  const statusFailure = classifyHttpStatus(challengeResponse.status, 'handshake challenge');
  if (statusFailure !== null) {
    if (statusFailure.errorCode === 'item_not_found')
      return { ok: false, failure: drift('handshake challenge returned 404 (route moved?)') };
    return { ok: false, failure: statusFailure };
  }
  let challengeJson: unknown;
  try {
    challengeJson = (await challengeResponse.json()) as unknown;
  } catch {
    return { ok: false, failure: drift('handshake challenge returned non-JSON') };
  }
  const parsed = parseChallenge(challengeJson);
  if ('errorCode' in parsed) return { ok: false, failure: parsed };
  const challenge = parsed;

  const snapshot = synthesizeHoverSnapshot(now());
  const { att, c } = buildFingerprint(snapshot, now());
  const seed = seedFor(challenge.salt, c);
  let wasmOut: number;
  try {
    wasmOut = await wasmImpl(challenge.wasm, seed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, failure: drift(`challenge wasm failed: ${message}`) };
  }
  let nonce: number;
  try {
    nonce = solveProofOfWork(challenge.salt, challenge.difficulty);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      failure: {
        errorCode: 'pow_budget_exhausted',
        errorMessage: message,
        transient: true,
      },
    };
  }
  const derived = derivedFor(challenge.salt, wasmOut, c);

  // itemId is a NUMBER on the wire, matching the client's productId prop.
  // A string "2626" yields an opaque 401 (FAIL-20260925-004).
  const verified = await postVerify(
    baseUrl,
    challenge,
    { nonce, derived, wasmOut, att, itemId, option },
    fetchImpl,
  );
  if (!verified.ok) return verified;

  const elapsedMs = now() - started;
  if (elapsedMs > verified.ttlMs) {
    return {
      ok: false,
      failure: {
        errorCode: 'pass_expired',
        errorMessage: `pass TTL (${verified.ttlMs}ms) expired before the quote (${elapsedMs}ms)`,
        transient: true,
      },
    };
  }

  let quoteResponse: Response;
  try {
    quoteResponse = await fetchImpl(
      `${baseUrl}/api/v2/items/${itemId}/quote?opt=${encodeURIComponent(option)}`,
      {
        headers: {
          Authorization: `Bearer ${verified.pass}`,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
  } catch (error) {
    return { ok: false, failure: classifyFetchError(error, 'quote request') };
  }
  if (quoteResponse.status === 401) {
    // Fresh pass rejected: TTL edge or server-side hiccup. A new handshake
    // is cheap, so this one may retry — unlike a verify-401, which replays
    // identical bytes and cannot recover by repetition.
    return {
      ok: false,
      failure: {
        errorCode: 'quote_unauthorized',
        errorMessage: 'quote rejected a fresh pass (TTL edge? retry with a new handshake)',
        transient: true,
      },
    };
  }
  if (quoteResponse.status === 404)
    return { ok: false, failure: drift('quote route returned 404 (storefront drift?)') };
  const quoteStatus = classifyHttpStatus(quoteResponse.status, 'quote request');
  if (quoteStatus !== null) return { ok: false, failure: quoteStatus };

  let quoteJson: unknown;
  try {
    quoteJson = (await quoteResponse.json()) as unknown;
  } catch {
    return { ok: false, failure: drift('quote returned non-JSON') };
  }
  if (!isRecord(quoteJson) || typeof quoteJson['blob'] !== 'string')
    return { ok: false, failure: drift('quote response has no blob field') };

  let payload: QuotePayload;
  try {
    payload = decodeQuotePayload(quoteJson['blob'], verified.pass);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, failure: drift(`quote blob undecodable: ${message}`) };
  }

  return {
    ok: true,
    quote: { payload, elapsedMs: now() - started, passTtlMs: verified.ttlMs },
  };
}
