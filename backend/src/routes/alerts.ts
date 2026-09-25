import { Router, type Request, type Response } from 'express';
import {
  getLatestAttempts,
  getRecentHistories,
  listActiveTrackedProducts,
} from '../persistence/repositories.js';
import { requireDb } from '../http/deps.js';

/**
 * Alerts (bonus): price-drop + back-in-stock, computed from validated
 * history only — never from failed attempts. Batched: 3 queries total
 * regardless of target count (targets + latest attempts + recent histories).
 * Email (SendGrid) is an optional hook: when SENDGRID_API_KEY + ALERT_TO are
 * set the scheduler logs a "would send" line; in-app badges always work.
 */
export const alertsRouter = Router();

alertsRouter.get('/alerts', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const threshold = thresholdPct(req.query['dropPct']);
  const rows = await listActiveTrackedProducts(db);
  const [latestAttempts, histories] = await Promise.all([
    getLatestAttempts(db),
    getRecentHistories(
      db,
      rows.map((row) => row.id),
    ),
  ]);
  const lastByTarget = new Map(latestAttempts.map((a) => [a.trackedProductId, a]));
  const histByTarget = new Map<string, typeof histories>();
  for (const h of histories) {
    const list = histByTarget.get(h.trackedProductId) ?? [];
    list.push(h);
    histByTarget.set(h.trackedProductId, list);
  }
  const alerts: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const history = histByTarget.get(row.id) ?? [];
    const [latest, prev] = [history[0], history[1]];
    if (latest === undefined) continue;
    const base = {
      trackedProductId: row.id,
      storeProductId: row.store_product_id,
      productName: row.product_name,
      selectedOption: row.selected_option,
    };
    if (prev !== undefined && prev.price > 0) {
      const drop = ((prev.price - latest.price) / prev.price) * 100;
      if (drop >= threshold) {
        alerts.push({
          ...base,
          type: 'price_drop',
          fromPrice: prev.price,
          toPrice: latest.price,
          dropPct: Math.round(drop * 100) / 100,
          observedAt: latest.observedAt,
        });
      }
    }
    const wasOut = prev !== undefined && prev.stock.trim() === '0';
    const isIn = latest.stock.trim() !== '0' && latest.stock.trim() !== '';
    if (wasOut && isIn) {
      alerts.push({ ...base, type: 'back_in_stock', stock: latest.stock, observedAt: latest.observedAt });
    }
    // Surface honesty: a failed last scrape mutes "all clear" claims.
    const last = lastByTarget.get(row.id);
    if (last?.outcome === 'failed') {
      alerts.push({
        ...base,
        type: 'scrape_failed',
        errorCode: last.errorCode,
        attemptedAt: last.attemptedAt,
      });
    }
  }
  res.json({ count: alerts.length, results: alerts });
});

function thresholdPct(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return 10;
  return n;
}
