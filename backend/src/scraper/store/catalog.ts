import { REQUEST_TIMEOUT_MS } from './constants.js';
import type { ScrapeErrorCode } from './types.js';

/**
 * Catalogue layer: plain JSON, no handshake (DEC-0008). Search is client-side
 * because the store ignores `?q=` (count stays 960 — OBS-20260925-002).
 */

export type FetchImpl = typeof fetch;

export interface StoreOption {
  id: string;
  label: string;
}

export interface StoreItem {
  id: number;
  slug: string;
  name: string;
  brand?: string;
  category?: string;
  sku?: string;
  optionAxis?: string;
  options: StoreOption[];
}

export interface StoreListing {
  id: number;
  slug: string;
  name: string;
  brand?: string;
  category?: string;
  sku?: string;
}

export interface ListingsPage {
  page: number;
  perPage: number;
  totalPages: number;
  count: number;
  results: StoreListing[];
}

import { errMsg, isRecord } from '../../http/guards.js';
import { realSleep, type Sleep } from '../retry.js';

/** Network/HTTP failure classified for the runner. Never throws. */
export interface FetchFailure {
  errorCode: ScrapeErrorCode;
  errorMessage: string;
  transient: boolean;
}

export function classifyHttpStatus(
  status: number,
  what: string,
): FetchFailure | null {
  if (status >= 200 && status < 300) return null;
  if (status === 429)
    return {
      errorCode: 'http_429',
      errorMessage: `${what} rate-limited (HTTP 429)`,
      transient: true,
    };
  if (status >= 500)
    return {
      errorCode: 'http_5xx',
      errorMessage: `${what} failed with HTTP ${status}`,
      transient: true,
    };
  if (status === 404)
    return {
      errorCode: 'item_not_found',
      errorMessage: `${what} returned HTTP 404`,
      transient: false,
    };
  return {
    errorCode: 'handshake_drift',
    errorMessage: `${what} returned unexpected HTTP ${status} (storefront drift?)`,
    transient: false,
  };
}

export function classifyFetchError(error: unknown, what: string): FetchFailure {
  const message = errMsg(error);
  if (/timeout|timed out|abort/i.test(message)) {
    return {
      errorCode: 'timeout',
      errorMessage: `${what} timed out: ${message}`,
      transient: true,
    };
  }
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    isRecord(cause) && typeof cause['code'] === 'string' ? cause['code'] : undefined;
  if (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    /reset|refused|socket|network/i.test(message)
  ) {
    return {
      errorCode: 'connection_reset',
      errorMessage: `${what} connection failed: ${message}`,
      transient: true,
    };
  }
  return {
    errorCode: 'connection_reset',
    errorMessage: `${what} fetch failed: ${message}`,
    transient: true,
  };
}

export async function fetchJson(
  url: string,
  what: string,
  fetchImpl: FetchImpl = fetch,
): Promise<{ ok: true; json: unknown } | { ok: false; failure: FetchFailure }> {  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, failure: classifyFetchError(error, what) };
  }
  const statusFailure = classifyHttpStatus(response.status, what);
  if (statusFailure !== null) return { ok: false, failure: statusFailure };
  try {
    return { ok: true, json: (await response.json()) as unknown };
  } catch {
    return {
      ok: false,
      failure: {
        errorCode: 'handshake_drift',
        errorMessage: `${what} returned non-JSON (storefront drift?)`,
        transient: false,
      },
    };
  }
}

/**
 * User-facing reads retry transient failures briefly (2x, 300ms base) before
 * giving up. The scrape RUNNER owns attempt budgets (SCRAPE-002) and never
 * uses this — double retry layers would burn the budget twice.
 */
export async function fetchJsonWithRetry(
  url: string,
  what: string,
  fetchImpl: FetchImpl = fetch,
  retries = 2,
  sleep: Sleep = realSleep,
): Promise<Awaited<ReturnType<typeof fetchJson>>> {
  let result = await fetchJson(url, what, fetchImpl);
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    if (result.ok || !result.failure.transient) break;
    await sleep(300 * attempt);
    result = await fetchJson(url, what, fetchImpl);
  }
  return result;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseListingsPage(json: unknown): ListingsPage {
  if (!isRecord(json)) throw new Error('listings page is not an object');
  const page = asNumber(json['page']);
  const perPage = asNumber(json['perPage']);
  const totalPages = asNumber(json['totalPages']);
  const count = asNumber(json['count']);
  const results = json['results'];
  if (page === null || perPage === null || totalPages === null || count === null)
    throw new Error('listings page is missing pagination fields');
  if (!Array.isArray(results)) throw new Error('listings page has no results[]');
  return {
    page,
    perPage,
    totalPages,
    count,
    results: results.map((entry, index) => {
      if (!isRecord(entry)) throw new Error(`listing ${index} is not an object`);
      const id = asNumber(entry['id']);
      const slug = asString(entry['slug']);
      const name = asString(entry['name']);
      if (id === null || slug === null || name === null)
        throw new Error(`listing ${index} is missing id/slug/name`);
      const listing: StoreListing = { id, slug, name };
      if (asString(entry['brand']) !== null)
        listing.brand = entry['brand'] as string;
      if (asString(entry['category']) !== null)
        listing.category = entry['category'] as string;
      if (asString(entry['sku']) !== null) listing.sku = entry['sku'] as string;
      return listing;
    }),
  };
}

export function parseStoreItem(json: unknown): StoreItem {
  if (!isRecord(json)) throw new Error('item is not an object');
  const id = asNumber(json['id']);
  const slug = asString(json['slug']);
  const name = asString(json['name']);
  if (id === null || slug === null || name === null)
    throw new Error('item is missing id/slug/name');
  const rawOptions = json['options'];
  if (!Array.isArray(rawOptions) || rawOptions.length === 0)
    throw new Error('item carries no options[]');
  const item: StoreItem = {
    id,
    slug,
    name,
    options: rawOptions.map((entry, index) => {
      if (!isRecord(entry)) throw new Error(`option ${index} is not an object`);
      const optionId = asString(entry['id']);
      const label = asString(entry['label']);
      if (optionId === null || label === null)
        throw new Error(`option ${index} is missing id/label`);
      return { id: optionId, label };
    }),
  };
  if (asString(json['brand']) !== null) item.brand = json['brand'] as string;
  if (asString(json['category']) !== null)
    item.category = json['category'] as string;
  if (asString(json['sku']) !== null) item.sku = json['sku'] as string;
  if (asString(json['optionAxis']) !== null)
    item.optionAxis = json['optionAxis'] as string;
  return item;
}

export type OptionMatch =
  | { ok: true; option: StoreOption }
  | { ok: false; errorCode: 'option_not_found' | 'option_ambiguous' };

/** Exact option-id match. Duplicated ids mean the storefront changed shape. */
export function matchOption(
  item: StoreItem,
  selectedOption: string,
): OptionMatch {
  const hits = item.options.filter((option) => option.id === selectedOption);
  if (hits.length === 0) return { ok: false, errorCode: 'option_not_found' };
  if (hits.length > 1) return { ok: false, errorCode: 'option_ambiguous' };
  const first = hits[0] as StoreOption;
  return { ok: true, option: first };
}

/**
 * Client-side name search (the store ignores `?q=`). Partial or full,
 * case-insensitive, substring on the product name.
 */
export function filterListingsByName(
  listings: StoreListing[],
  query: string,
): StoreListing[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  return listings.filter((listing) =>
    listing.name.toLowerCase().includes(needle),
  );
}

export function listingsUrl(
  baseUrl: string,
  page: number,
  limit: number,
): string {
  return `${baseUrl}/api/v2/listings?page=${page}&limit=${limit}`;
}

export function itemUrl(baseUrl: string, itemId: number): string {
  return `${baseUrl}/api/v2/items/${itemId}`;
}
