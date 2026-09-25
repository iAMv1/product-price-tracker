import { Router, type Request, type Response } from 'express';
import {
  createTrackedProduct,
  getAttemptLog,
  getHistory,
  getLatestValidated,
  getTrackedProduct,
  listActiveTrackedProducts,
} from '../persistence/repositories.js';
import { rowToTarget, runAllTargets } from '../scraper/runner.js';
import {
  fetchJson,
  itemUrl,
  matchOption,
  parseStoreItem,
} from '../scraper/store/catalog.js';
import { productUrl, readDeps, requireDb, routeParam, storeBaseUrl } from '../http/deps.js';

/**
 * Tracking intent + evidence reads (TRACK-001 / UI-001 reads).
 * POST track validates the option against the live item, persists the
 * target, and scrapes it once immediately so the dashboard never shows an
 * empty card waiting for the next 2-hour tick.
 */

export const trackedRouter = Router();

trackedRouter.get('/', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const rows = await listActiveTrackedProducts(db);
  const targets = await Promise.all(
    rows.map(async (row) => {
      const latest = await getLatestValidated(db, row.id);
      const log = await getAttemptLog(db, row.id, 1);
      const lastAttempt = log[0];
      return {
        id: row.id,
        storeProductId: row.store_product_id,
        productName: row.product_name,
        selectedOption: row.selected_option,
        productUrl: row.product_url,
        latest: latest
          ? { price: latest.price, stock: latest.stock, observedAt: latest.observed_at }
          : null,
        lastScrape: lastAttempt
          ? {
              outcome: lastAttempt.outcome,
              attemptedAt: lastAttempt.attempted_at,
              errorCode: lastAttempt.error_code,
            }
          : null,
      };
    }),
  );
  res.json({ count: targets.length, results: targets });
});

trackedRouter.post('/', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const storeProductId = typeof body['storeProductId'] === 'string' ? body['storeProductId'] : '';
  const selectedOption = typeof body['selectedOption'] === 'string' ? body['selectedOption'] : '';
  if (!/^\d+$/.test(storeProductId) || selectedOption.trim() === '') {
    res.status(400).json({
      error: 'bad_request',
      message: 'storeProductId (numeric string) and selectedOption are required',
    });
    return;
  }
  const { storeFetch, scrape } = readDeps(req);
  const baseUrl = storeBaseUrl();
  const itemId = Number(storeProductId);

  const fetched = await fetchJson(itemUrl(baseUrl, itemId), `item ${itemId}`, storeFetch);
  if (!fetched.ok) {
    const { errorCode, errorMessage, transient } = fetched.failure;
    if (errorCode === 'item_not_found') {
      res.status(404).json({ error: errorCode, message: errorMessage });
      return;
    }
    res.status(transient ? 502 : 500).json({ error: errorCode, message: errorMessage });
    return;
  }
  let productName: string;
  try {
    const item = parseStoreItem(fetched.json);
    const matched = matchOption(item, selectedOption);
    if (!matched.ok) {
      res.status(400).json({
        error: matched.errorCode,
        message:
          matched.errorCode === 'option_ambiguous'
            ? `option "${selectedOption}" is ambiguous for item ${itemId}`
            : `option "${selectedOption}" is not listed for item ${itemId} (options: ${item.options.map((o) => o.id).join(',') || 'none'})`,
      });
      return;
    }
    productName = item.name;
  } catch {
    res.status(500).json({ error: 'handshake_drift', message: 'item changed shape unexpectedly' });
    return;
  }

  const url = productUrl(storeProductId);
  let row;
  try {
    row = await createTrackedProduct(db, {
      storeProductId,
      productName,
      selectedOption,
      productUrl: url,
    });
  } catch {
    // Duplicate identity: idempotent re-track. Return the existing target.
    const existing = (await listActiveTrackedProducts(db)).find(
      (candidate) =>
        candidate.store_product_id === storeProductId &&
        candidate.selected_option === selectedOption,
    );
    if (existing === undefined) throw new Error('duplicate insert without existing row');
    res.json({
      id: existing.id,
      storeProductId: existing.store_product_id,
      productName: existing.product_name,
      selectedOption: existing.selected_option,
      productUrl: existing.product_url,
      deduped: true,
      firstScrape: null,
    });
    return;
  }

  // Immediate first scrape: seeds history + log without waiting for cron.
  const summary = await runAllTargets(db, {
    triggerType: 'manual',
    targets: [rowToTarget(row)],
    scrape,
  });
  const latest = await getLatestValidated(db, row.id);
  res.status(201).json({
    id: row.id,
    storeProductId: row.store_product_id,
    productName: row.product_name,
    selectedOption: row.selected_option,
    productUrl: row.product_url,
    deduped: false,
    firstScrape:
      summary.succeeded === 1
        ? { outcome: 'success', latest }
        : { outcome: 'failed', latest: null },
  });
});

trackedRouter.patch('/:id', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const id = routeParam(req, 'id');
  if (!isUuid(id)) {
    res.status(400).json({ error: 'bad_request', message: 'id must be a UUID' });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body['isActive'] !== 'boolean') {
    res.status(400).json({ error: 'bad_request', message: 'isActive (boolean) is required' });
    return;
  }
  const updated = await db.query(
    'UPDATE tracked_products SET is_active = $1, updated_at = now() WHERE id = $2',
    [body['isActive'], id],
  );
  if ((updated.rowCount ?? 0) === 0) {
    res.status(404).json({ error: 'not_found', message: 'tracked product not found' });
    return;
  }
  res.json({ id, isActive: body['isActive'] });
});

trackedRouter.delete('/:id', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const id = routeParam(req, 'id');
  if (!isUuid(id)) {
    res.status(400).json({ error: 'bad_request', message: 'id must be a UUID' });
    return;
  }
  // Hard delete cascades to attempts + history (schema ON DELETE CASCADE).
  // Explicit user choice; the audit trail for REMAINING targets is untouched.
  const deleted = await db.query('DELETE FROM tracked_products WHERE id = $1', [id]);
  if ((deleted.rowCount ?? 0) === 0) {
    res.status(404).json({ error: 'not_found', message: 'tracked product not found' });
    return;
  }
  res.status(204).end();
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

trackedRouter.get('/:id/history', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const limit = clampLimit(req.query['limit']);
  res.json({
    results: await getHistory(db, routeParam(req, 'id'), limit),
  });
});

trackedRouter.get('/:id/scrape-log', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const limit = clampLimit(req.query['limit']);
  res.json({
    results: await getAttemptLog(db, routeParam(req, 'id'), limit),
  });
});

trackedRouter.post('/:id/scrape', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const { scrape } = readDeps(req);
  const row = await getTrackedProduct(db, routeParam(req, 'id'));
  if (row === null) {
    res.status(404).json({ error: 'not_found', message: 'tracked product not found' });
    return;
  }
  const summary = await runAllTargets(db, {
    triggerType: 'manual',
    targets: [rowToTarget(row)],
    scrape,
  });
  res.json(summary);
});

function clampLimit(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n <= 0) return 100;
  return Math.min(n, 200);
}
