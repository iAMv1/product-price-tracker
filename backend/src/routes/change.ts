import { Router, type Request, type Response } from 'express';
import { requireDb } from '../http/deps.js';

/**
 * Change detection (bonus): flags when the store's page structure shifts.
 * No new table: surfaces recent terminal structure codes from the existing
 * attempt log (handshake_drift, option_not_found, option_ambiguous,
 * validation_*). A non-empty list means "store changed, investigate".
 */
const STRUCTURE_CODES = [
  'handshake_drift',
  'option_not_found',
  'option_ambiguous',
  'validation_identity',
  'validation_price',
  'validation_stock',
];

export const changeRouter = Router();

changeRouter.get('/change-events', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const limit = clamp(req.query['limit']);
  const result = await db.query(
    `SELECT sa.attempted_at, sa.error_code, sa.error_message,
            tp.store_product_id, tp.product_name, tp.selected_option
     FROM scrape_attempts sa
     JOIN tracked_products tp ON tp.id = sa.tracked_product_id
     WHERE sa.error_code = ANY($1)
     ORDER BY sa.attempted_at DESC LIMIT $2`,
    [STRUCTURE_CODES, limit],
  );
  res.json({ count: result.rows.length, results: result.rows });
});

function clamp(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n <= 0) return 50;
  return Math.min(n, 200);
}
