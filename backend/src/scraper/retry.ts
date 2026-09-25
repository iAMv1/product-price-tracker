/**
 * Bounded retry policy (SCRAPE-002). Attempt counting starts at 1: after
 * failed attempt n (1-based), wait backoffMs(n) and try again while n < max.
 * Deterministic validation failures are terminal on attempt 1 — the scraper
 * says so via transient:false, and this policy never overrides that.
 */

/** Recommended initial policy (PROJECT_SPEC.md section 9): max 3 attempts. */
export const MAX_ATTEMPTS = 3;
/** Base backoff per failed attempt (the bundle client itself uses 300*n). */
export const BACKOFF_BASE_MS = 300;
/** Jitter ceiling so a batch of targets does not retry in lockstep. */
export const BACKOFF_JITTER_MS = 100;

/** Backoff after failed attempt n. `rand` is injectable for deterministic tests. */
export function backoffMs(
  failedAttemptNumber: number,
  rand: () => number = Math.random,
): number {
  return BACKOFF_BASE_MS * failedAttemptNumber + Math.floor(rand() * BACKOFF_JITTER_MS);
}

export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
