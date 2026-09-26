import { Router, type Request, type Response } from 'express';
import {
  fetchJsonWithRetry,
  filterListingsByName,
  itemUrl,
  listingsUrl,
  parseListingsPage,
  parseStoreItem,
} from '../scraper/store/catalog.js';
import { productUrl, readDeps, routeParam, storeBaseUrl } from '../http/deps.js';

/**
 * Catalogue reads (TRACK-001). Plain JSON, no handshake, no database.
 * Search is client-side: the store ignores `?q=`, so we walk listing pages
 * and filter by name until enough matches or pages run out. Transient page
 * failures retry briefly, then the page is skipped rather than failing the
 * whole search — a 503 on page 28 must not void 27 pages of matches
 * (observed live mid-walk).
 */

const SEARCH_PAGE_LIMIT = 24;
const SEARCH_MAX_RESULTS = 20;
/** Hard ceiling on the name walk — a lying/huge `totalPages` stays bounded. */
const SEARCH_MAX_PAGES = 40;

/**
 * Identical queries within a minute cost nothing upstream: type-ahead
 * re-fires and replay probes become 0 store requests instead of a 40-page
 * walk each. Incomplete results are NEVER cached — search again must retry
 * the missing pages. Test runs inject a fake store (deps set), so the cache
 * only engages when the real global fetch path is in use.
 */
const searchMemo = new Map<string, { expires: number; body: unknown }>();
const SEARCH_MEMO_MS = 60_000;
const SEARCH_MEMO_MAX = 100;

export const productsRouter = Router();

productsRouter.get('/search', async (req: Request, res: Response) => {
  const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
  if (q.trim() === '') {
    res.status(400).json({ error: 'bad_request', message: 'query param q is required' });
    return;
  }
  const { storeFetch } = readDeps(req);
  const baseUrl = storeBaseUrl();

  // Postel (LAW 16): accept a bare store id or a pasted item link the same as
  // a name. The catalogue walk below filters NAMES, so digits ("2626") match
  // nothing there — one direct item request answers the id/URL case instead
  // of a slow 24-page walk that can never succeed.
  const trimmed = q.trim();
  const idFromQuery = /^\d+$/.test(trimmed)
    ? trimmed
    : (trimmed.match(/\/item\/(\d+)/i)?.[1] ?? null);
  if (idFromQuery !== null) {
    const fetched = await fetchJsonWithRetry(
      itemUrl(baseUrl, Number(idFromQuery)),
      `item ${idFromQuery}`,
      storeFetch,
    );
    if (fetched.ok) {
      try {
        const item = parseStoreItem(fetched.json);
        res.json({
          query: q,
          count: 1,
          incomplete: false,
          results: [
            {
              storeProductId: String(item.id),
              name: item.name,
              brand: item.brand ?? null,
              category: item.category ?? null,
              productUrl: productUrl(String(item.id)),
            },
          ],
        });
        return;
      } catch {
        res
          .status(500)
          .json({ error: 'handshake_drift', message: 'item changed shape unexpectedly' });
        return;
      }
    }
    const { errorCode, errorMessage, transient } = fetched.failure;
    if (errorCode === 'item_not_found') {
      // Unknown id: an honest empty result, not a name walk that cannot match.
      res.json({ query: q, count: 0, incomplete: false, results: [] });
      return;
    }
    res.status(transient ? 502 : 500).json({ error: errorCode, message: errorMessage });
    return;
  }

  const seen = new Set<string>();
  const matches: Array<Record<string, unknown>> = [];
  let page = 1;
  let totalPages = 1;
  let incomplete = false;
  // Replay/typing repeats hit the memo instead of the store (see above).
  const memoKey = q.trim().toLowerCase();
  const memoEnabled = req.app.locals.storeFetch === undefined;
  if (memoEnabled) {
    const hit = searchMemo.get(memoKey);
    if (hit !== undefined && hit.expires > Date.now()) {
      res.json(hit.body);
      return;
    }
    if (hit !== undefined) searchMemo.delete(memoKey);
  }
  try {
    while (page <= totalPages && matches.length < SEARCH_MAX_RESULTS) {
      const fetched = await fetchJsonWithRetry(
        listingsUrl(baseUrl, page, SEARCH_PAGE_LIMIT),
        `listings page ${page}`,
        storeFetch,
      );
      if (!fetched.ok) {
        // Persistent failure: skip the page, say so, keep collected matches.
        incomplete = true;
        page += 1;
        continue;
      }
      const listings = parseListingsPage(fetched.json);
      totalPages = Math.min(listings.totalPages, SEARCH_MAX_PAGES);
      for (const hit of filterListingsByName(listings.results, q)) {
        if (matches.length >= SEARCH_MAX_RESULTS) break;
        // The store repeats items across listing pages; collapse duplicates
        // so one product is one search row.
        if (seen.has(String(hit.id))) continue;
        seen.add(String(hit.id));
        matches.push({
          storeProductId: String(hit.id),
          name: hit.name,
          brand: hit.brand ?? null,
          category: hit.category ?? null,
          productUrl: productUrl(String(hit.id)),
        });
      }
      page += 1;
    }
  } catch {
    res.status(500).json({ error: 'handshake_drift', message: 'catalogue changed shape unexpectedly' });
    return;
  }
  const body = { query: q, count: matches.length, incomplete, results: matches };
  // Cache only COMPLETE answers — a partial walk must stay retryable.
  if (memoEnabled && !incomplete) {
    if (searchMemo.size >= SEARCH_MEMO_MAX) {
      const oldest = searchMemo.keys().next().value;
      if (oldest !== undefined) searchMemo.delete(oldest);
    }
    searchMemo.set(memoKey, { expires: Date.now() + SEARCH_MEMO_MS, body });
  }
  res.json(body);
});

productsRouter.get('/:id', async (req: Request, res: Response) => {
  const id = routeParam(req, 'id');
  if (!/^\d+$/.test(id)) {
    res.status(400).json({ error: 'bad_request', message: 'product id must be numeric' });
    return;
  }
  const { storeFetch } = readDeps(req);
  const fetched = await fetchJsonWithRetry(
    itemUrl(storeBaseUrl(), Number(id)),
    `item ${id}`,
    storeFetch,
  );
  if (!fetched.ok) {
    const { errorCode, errorMessage, transient } = fetched.failure;
    if (errorCode === 'item_not_found') {
      res.status(404).json({ error: errorCode, message: errorMessage });
      return;
    }
    res.status(transient ? 502 : 500).json({ error: errorCode, message: errorMessage });
    return;
  }
  try {
    const item = parseStoreItem(fetched.json);
    res.json({
      storeProductId: String(item.id),
      name: item.name,
      brand: item.brand ?? null,
      category: item.category ?? null,
      sku: item.sku ?? null,
      optionAxis: item.optionAxis ?? null,
      options: item.options,
      productUrl: productUrl(String(item.id)),
    });
  } catch {
    res.status(500).json({ error: 'handshake_drift', message: 'item changed shape unexpectedly' });
  }
});
