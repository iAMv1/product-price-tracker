import { env } from '../../config/env.js';

/**
 * Volatile storefront constants (DEC-0008). Everything here is tied to bundle
 * revision 632002: the bundle is content-hashed and `dr` derives from its
 * contents, so a redeploy can invalidate the handshake. These are
 * configuration, not facts — a shape mismatch must raise `handshake_drift`,
 * never a generic failure.
 */
export const STORE_BASE_URL = env.storeUrl;

/** Bundle revision the handshake was recovered from (OBS-20260925-004). */
export const BUNDLE_REVISION = 632002;

/**
 * Assembled from the decoded string table
 * (P(232)+P(295)+P(166)+P(294)+P(297)+P(198)+P(221)+P(272)+P(253)+P(169)+P(172))
 * and confirmed identical when evaluated from the bundle itself.
 */
export const DR =
  'feffd924900aae681d40425da2e3f3ef53e3ab0a8c2e6acd330b5265f3794b56';

/** Fingerprint probe inputs, transcribed from backend/tools/bundle-crypto.mjs
 * (which drove the bundle's own code — VER-20260925-002). `ir` hashed, so
 * the values below are what the wire carries, not secrets. */
export const CANVAS_PROBE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANwAAAA8CAYAAAA';
export const GL_PROBE =
  'Google Inc. (Intel)|ANGLE (Intel, Intel(R) UHD Graphics)|WebGL 1.0';

/** Hover-tracker thresholds recovered from the bundle (`new Ar({...})`). */
export const HOVER_MIN_MOVES = 8;
export const HOVER_MIN_DWELL_MS = 600;
/** `move()` ignores events closer than 40ms apart; keeps at most 40 moves. */
export const HOVER_THROTTLE_MS = 40;
export const HOVER_MAX_MOVES = 40;

/** Observed proof-of-work difficulty was 3 (10–33ms). Above this we assume
 * the store changed its defense and fail loudly instead of burning CPU. */
export const MAX_POW_DIFFICULTY = 8;
/** Absolute cap on PoW iterations before giving up for this attempt. */
export const MAX_POW_NONCE = 100_000_000;

/** Per-request network timeout (matches the spike probes). */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Identifies the quote decoder in `scrape_attempts.parser_version`. */
export const PARSER_VERSION = 'store-handshake-v1';
