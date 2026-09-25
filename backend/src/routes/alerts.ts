import { Router, type Request, type Response } from 'express';
import {
  getAttemptLog,
  getHistory,
  listActiveTrackedProducts,
} from '../persistence/repositories.js';
import { requireDb } from '../http/deps.js';

/**
 * Alerts (bonus): price-drop + back-in-stock, computed from validated
 * history only — never from failed attempts.
 * - price_drop: latest < previous by >= threshold (default 10%).
 * - back_in_stock: previous stock '0'/empty, latest non-zero.
 * Email (SendGrid) is an optional hook: when SENDGRID_API_KEY + ALERT_TO are
 * set the scheduler logs a "would send" line; in-app badges always work.
 */
export const alertsRouter = Router();

alertsRouter.get('/alerts', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const threshold = thresholdPct(req.query['dropPct']);
  const rows = await listActiveTrackedProducts(db);
  const alerts: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const history = await getHistory(db, row.id, 2);
    if (history.length < 1) continue;
    const [latest, prev] = [history[0], history[1]];
    if (latest === undefined) continue;
    if (prev !== undefined && prev.price > 0) {
      const drop = ((prev.price - latest.price) / prev.price) * 100;
      if (drop >= threshold) {
        alerts.push({
          type: 'price_drop',
          trackedProductId: row.id,
          storeProductId: row.store_product_id,
          productName: row.product_name,
          selectedOption: row.selected_option,
          fromPrice: prev.price,
          toPrice: latest.price,
          dropPct: Math.round(drop * 100) / 100,
          observedAt: latest.observed_at,
        });
      }
    }
    const wasOut = prev !== undefined && prev.stock.trim() === '0';
    const isIn = latest.stock.trim() !== '0' && latest.stock.trim() !== '';
    if (wasOut && isIn) {
      alerts.push({
        type: 'back_in_stock',
        trackedProductId: row.id,
        storeProductId: row.store_product_id,
        productName: row.product_name,
        selectedOption: row.selected_option,
        stock: latest.stock,
        observedAt: latest.observed_at,
      });
    }
    // Surface honesty: a failed last scrape mutes "all clear" claims.
    const log = await getAttemptLog(db, row.id, 1);
    if (log[0]?.outcome === 'failed') {
      alerts.push({
        type: 'scrape_failed',
        trackedProductId: row.id,
        storeProductId: row.store_product_id,
        productName: row.product_name,
        selectedOption: row.selected_option,
        errorCode: log[0].error_code,
        attemptedAt: log[0].attempted_at,
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
