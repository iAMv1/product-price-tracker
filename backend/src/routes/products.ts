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

export const productsRouter = Router();

productsRouter.get('/search', async (req: Request, res: Response) => {
  const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
  if (q.trim() === '') {
    res.status(400).json({ error: 'bad_request', message: 'query param q is required' });
    return;
  }
  const { storeFetch } = readDeps(req);
  const baseUrl = storeBaseUrl();
  const seen = new Set<string>();
  const matches: Array<Record<string, unknown>> = [];
  let page = 1;
  let totalPages = 1;
  let incomplete = false;
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
      totalPages = listings.totalPages;
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
  res.json({ query: q, count: matches.length, incomplete, results: matches });
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
