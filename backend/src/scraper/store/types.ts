/**
 * Store-scraper contract (PROJECT_SPEC.md section 7, adapted).
 *
 * The scraper reports ok:false for ANY failed attempt and never chooses
 * between `retried` and `failed` itself — that classification belongs to the
 * retry policy (SCRAPE-002), which owns the transient flag AND the retry
 * budget. The runner maps ok:true -> success,
 * ok:false && transient && budget-remains -> retried, else failed.
 *
 * Deliberately no partially-valid success states.
 */

export interface ScrapeInput {
  /** Store product id as written by the user (digits; coerced for the wire). */
  productId: string;
  /** Exact option id from the item's options list (e.g. "o1"). */
  selectedOption: string;
  /** Product URL — part of the tracked identity, carried for evidence. */
  productUrl: string;
}

export interface ScrapeSuccess {
  ok: true;
  productId: string;
  productName: string;
  selectedOption: string;
  price: number;
  /** Stock preserved as text: the DB column is TEXT (counts and labels both). */
  stock: string;
  durationMs: number;
  fetchStrategy: 'http';
  parserVersion: string;
}

/**
 * Terminal codes never retry (validation, identity, drift). Transient codes
 * may retry within the runner's bounded budget. `handshake_drift` is the
 * storefront-redeploy signal (DEC-0008): terminal, loud, specific — never
 * retried into a rate limit, never surfaced as a vague `failed`.
 */
export type ScrapeErrorCode =
  | 'timeout'
  | 'connection_reset'
  | 'http_429'
  | 'http_5xx'
  | 'quote_unauthorized'
  | 'pass_expired'
  | 'pow_budget_exhausted'
  | 'bad_product_id'
  | 'item_not_found'
  | 'option_not_found'
  | 'option_ambiguous'
  | 'handshake_drift'
  | 'validation_price'
  | 'validation_stock'
  | 'validation_identity'
  | 'internal_error';

export interface ScrapeFailure {
  ok: false;
  productId: string;
  productName?: string;
  selectedOption: string;
  errorCode: ScrapeErrorCode;
  errorMessage: string;
  durationMs: number;
  transient: boolean;
}

export type ScrapeResult = ScrapeSuccess | ScrapeFailure;

/** Error codes the runner is allowed to retry (bounded, SCRAPE-002). */
export const TRANSIENT_CODES: ReadonlySet<ScrapeErrorCode> = new Set([
  'timeout',
  'connection_reset',
  'http_429',
  'http_5xx',
  'quote_unauthorized',
  'pass_expired',
  'pow_budget_exhausted',
]);

export function isTransientCode(code: ScrapeErrorCode): boolean {
  return TRANSIENT_CODES.has(code);
}
