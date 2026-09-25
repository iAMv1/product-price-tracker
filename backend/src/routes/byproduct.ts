import { Router, type Request, type Response } from 'express';
import {
  createTrackedProduct,
  getLatestValidated,
  listActiveTrackedProducts,
} from '../persistence/repositories.js';
import { rowToTarget, runAllTargets } from '../scraper/runner.js';
import { fetchJson, itemUrl, matchOption, parseStoreItem } from '../scraper/store/catalog.js';
import { productUrl, readDeps, requireDb, storeBaseUrl } from '../http/deps.js';
import { requireUser } from '../http/auth.js';

/**
 * Multi-option scrape in one run (bonus): track + scrape several options of
 * the SAME product in a single invocation. Reuses the exact validation +
 * atomic-write path as single track; the run row groups every option.
 */
export const byProductRouter = Router();

byProductRouter.post('/by-product', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const storeProductId = typeof body['storeProductId'] === 'string' ? body['storeProductId'] : '';
  const options = Array.isArray(body['options'])
    ? body['options'].filter((o): o is string => typeof o === 'string' && o.trim() !== '')
    : [];
  if (!/^\d+$/.test(storeProductId) || options.length === 0 || options.length > 8) {
    res.status(400).json({
      error: 'bad_request',
      message: 'storeProductId (numeric string) and options (1-8 strings) are required',
    });
    return;
  }
  const unique = [...new Set(options)];
  const { storeFetch, scrape, authVerify } = readDeps(req);
  if ((await requireUser(req, res, authVerify)) === null) return;
  const baseUrl = storeBaseUrl();
  const itemId = Number(storeProductId);

  const fetched = await fetchJson(itemUrl(baseUrl, itemId), `item ${itemId}`, storeFetch);
  if (!fetched.ok) {
    const { errorCode, errorMessage, transient } = fetched.failure;
    res.status(errorCode === 'item_not_found' ? 404 : transient ? 502 : 500).json({
      error: errorCode,
      message: errorMessage,
    });
    return;
  }
  let productName: string;
  try {
    const item = parseStoreItem(fetched.json);
    for (const opt of unique) {
      const matched = matchOption(item, opt);
      if (!matched.ok) {
        res.status(400).json({
          error: matched.errorCode,
          message: `option "${opt}" is not listed for item ${itemId} (options: ${item.options.map((o) => o.id).join(',') || 'none'})`,
        });
        return;
      }
    }
    productName = item.name;
  } catch {
    res.status(500).json({ error: 'handshake_drift', message: 'item changed shape unexpectedly' });
    return;
  }

  const url = productUrl(storeProductId);
  const interval =
    typeof body['scrapeIntervalHours'] === 'number' ? body['scrapeIntervalHours'] : 2;
  const targets = [];
  for (const opt of unique) {
    try {
      targets.push(
        rowToTarget(
          await createTrackedProduct(db, {
            storeProductId,
            productName,
            selectedOption: opt,
            productUrl: url,
            scrapeIntervalHours: interval,
          }),
        ),
      );
    } catch {
      const existing = (await listActiveTrackedProducts(db)).find(
        (c) => c.store_product_id === storeProductId && c.selected_option === opt,
      );
      if (existing === undefined) throw new Error('duplicate insert without existing row');
      targets.push(rowToTarget(existing));
    }
  }
  const summary = await runAllTargets(db, { triggerType: 'manual', targets, scrape });
  const latest = await Promise.all(
    targets.map(async (t) => ({
      targetId: t.id,
      selectedOption: t.selectedOption,
      latest: await getLatestValidated(db, t.id),
    })),
  );
  res.status(201).json({ ...summary, targets: latest });
});
