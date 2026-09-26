/**
 * Bounded retry policy (SCRAPE-002). Attempt counting starts at 1: after
 * failed attempt n (1-based), wait backoffMs(n) and try again while n < max.
 * Deterministic validation failures are terminal on attempt 1 — the scraper
 * says so via transient:false, and this policy never overrides that.
 */

/** Recommended initial policy (PROJECT_SPEC.md section 9): max 3 attempts. */
export const MAX_ATTEMPTS = 3;
/** Initial backoff after the first failed attempt (docs: 1s / 2s / 4s). */
export const BACKOFF_BASE_MS = 1000;
/** Ceiling per wait: the doubling backoff never exceeds this. */
export const BACKOFF_CAP_MS = 4000;
/** Jitter ceiling so a batch of targets does not retry in lockstep. */
export const BACKOFF_JITTER_MS = 100;

/**
 * Backoff after failed attempt n: 1000ms, 2000ms, … capped at 4000ms,
 * plus bounded jitter. `rand` is injectable for deterministic tests.
 * (The catalog listing walk keeps its own separate 300*n pacing — see
 * store/catalog.ts; that is request pacing, not this retry policy.)
 */
export function backoffMs(
  failedAttemptNumber: number,
  rand: () => number = Math.random,
): number {
  const exponential =
    BACKOFF_BASE_MS * 2 ** Math.max(0, failedAttemptNumber - 1);
  const capped = Math.min(exponential, BACKOFF_CAP_MS);
  return capped + Math.floor(rand() * BACKOFF_JITTER_MS);
}

export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
