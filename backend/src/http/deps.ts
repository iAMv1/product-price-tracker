import type { Request } from 'express';
import type { Queryable } from '../persistence/db.js';
import { getPool } from '../persistence/db.js';
import type { FetchImpl } from '../scraper/store/catalog.js';
import { STORE_BASE_URL } from '../scraper/store/constants.js';
import type { ScrapeFn } from '../scraper/runner.js';
import { scrapeProduct } from '../scraper/store/scrape.js';

/**
 * Per-app dependency injection. Tests pass fakes; production omits them:
 * db resolves lazily from DATABASE_URL (503 when unconfigured), store calls
 * use global fetch, scraping uses the real handshake scraper.
 */
export interface AppDeps {
  db?: Queryable | null;
  storeFetch?: FetchImpl;
  scrape?: ScrapeFn;
}

export function readDeps(req: Request): Required<AppDeps> {
  const locals = req.app.locals as Partial<AppDeps>;
  return {
    db: locals.db ?? null,
    storeFetch: locals.storeFetch ?? fetch,
    scrape: locals.scrape ?? scrapeProduct,
  };
}

/** Database when explicitly injected (tests) or lazily from env (prod). */
export async function resolveDb(req: Request): Promise<Queryable | null> {
  const locals = req.app.locals as Partial<AppDeps> & { __dbResolved?: boolean };
  if (locals.db !== undefined) return locals.db;
  return getPool();
}

export function storeBaseUrl(): string {
  return STORE_BASE_URL;
}

/** Express 5 types params as string|string[]; our routes use single values. */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/** Product page URL carries the store id, as the assignment's CSV requires. */
export function productUrl(storeProductId: string): string {
  return `${STORE_BASE_URL}/item/${storeProductId}`;
}
