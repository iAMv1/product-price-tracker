import { Router, type Request, type Response } from 'express';
import { getExportRows } from '../persistence/repositories.js';
import { requireDb } from '../http/deps.js';

/**
 * Audit-grade CSV export (EXPORT-001). One row per scrape attempt, projected
 * straight from v_scrape_attempt_export: non-success rows are empty by
 * construction. Column order follows the assignment; attempt_number rides
 * along so retry chains stay readable.
 */

const HEADER =
  'product_id,product_name,selected_option,timestamp,price,stock,outcome,attempt_number';

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  // Formula injection: a store-controlled value starting with =,+,-,@ would
  // execute in Excel. Prefixing with a quote keeps the cell literal.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const csvCellForTest = cell;

export const exportRouter = Router();

exportRouter.get('/export.csv', async (req: Request, res: Response) => {
  const db = await requireDb(req, res);
  if (db === null) return;
  const rows = await getExportRows(db);
  const lines = rows.map((row) =>
    [
      cell(row.product_id),
      cell(row.product_name),
      cell(row.selected_option),
      cell(row.timestamp),
      cell(row.price),
      cell(row.stock),
      cell(row.outcome),
      cell(row.attempt_number),
    ].join(','),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="scrape-history.csv"');
  res.send([HEADER, ...lines].join('\n') + '\n');
});
