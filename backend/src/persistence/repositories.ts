import { randomUUID } from 'node:crypto';
import type { Queryable } from './db.js';

/**
 * Persistence over the DB-001 schema. All statements are parameterized and
 * single-round-trip; the success path writes attempt + history atomically in
 * one CTE so the two price/stock copies can never diverge.
 */

export interface TrackedProductRow {
  id: string;
  store_product_id: string;
  product_name: string;
  selected_option: string;
  product_url: string;
  is_active: boolean;
}

export interface ScrapeRunRow {
  id: string;
  trigger_type: string;
}

export interface AttemptLogRow {
  attempt_number: number;
  attempted_at: string;
  outcome: string;
  price: number | null;
  stock: string | null;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
}

export interface HistoryRow {
  price: number;
  stock: string;
  observed_at: string;
}

export interface ExportRow {
  product_id: string;
  product_name: string;
  selected_option: string;
  timestamp: string;
  price: string | number | null;
  stock: string | null;
  outcome: string;
  attempt_number: number;
}

/**
 * NUMERIC arrives as string from node-postgres and number from pg-mem.
 * Prices are integer minor units (well under 2^53), so normalize to number
 * at the boundary; CSV stringifies anyway.
 */
function toPrice(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`invalid price from database: ${String(value)}`);
  return n;
}

function rows<T>(result: { rows: Array<Record<string, unknown>> }): T[] {
  return result.rows as unknown as T[];
}

function one<T>(result: { rows: Array<Record<string, unknown>> }): T {
  const [row] = result.rows;
  if (row === undefined) throw new Error('expected exactly one row');
  return row as unknown as T;
}

export async function createTrackedProduct(
  db: Queryable,
  input: {
    storeProductId: string;
    productName: string;
    selectedOption: string;
    productUrl: string;
  },
): Promise<TrackedProductRow> {
  const result = await db.query(
    `INSERT INTO tracked_products (id, store_product_id, product_name, selected_option, product_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, store_product_id, product_name, selected_option, product_url, is_active`,
    [randomUUID(), input.storeProductId, input.productName, input.selectedOption, input.productUrl],
  );
  return one<TrackedProductRow>(result);
}

export async function listActiveTrackedProducts(
  db: Queryable,
): Promise<TrackedProductRow[]> {
  const result = await db.query(
    `SELECT id, store_product_id, product_name, selected_option, product_url, is_active
     FROM tracked_products WHERE is_active = TRUE ORDER BY created_at`,
  );
  return rows<TrackedProductRow>(result);
}

export async function createScrapeRun(
  db: Queryable,
  input: { triggerType: string; targetCount: number },
): Promise<ScrapeRunRow> {
  const result = await db.query(
    `INSERT INTO scrape_runs (id, trigger_type, status, target_count)
     VALUES ($1, $2, 'running', $3) RETURNING id, trigger_type`,
    [randomUUID(), input.triggerType, input.targetCount],
  );
  return one<ScrapeRunRow>(result);
}

export async function completeScrapeRun(
  db: Queryable,
  runId: string,
  counts: { successCount: number; retriedCount: number; failureCount: number },
): Promise<void> {
  await db.query(
    `UPDATE scrape_runs
     SET status = 'completed', completed_at = now(),
         success_count = $2, retried_count = $3, failure_count = $4
     WHERE id = $1`,
    [runId, counts.successCount, counts.retriedCount, counts.failureCount],
  );
}

export interface NonSuccessAttempt {
  runId: string;
  trackedProductId: string;
  attemptNumber: number;
  outcome: 'retried' | 'failed';
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
  durationMs?: number;
}

export async function recordNonSuccessAttempt(
  db: Queryable,
  attempt: NonSuccessAttempt,
): Promise<string> {
  const result = await db.query(
    `INSERT INTO scrape_attempts
       (id, scrape_run_id, tracked_product_id, attempt_number, outcome,
        error_code, error_message, http_status, duration_ms, fetch_strategy, parser_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'http', 'store-handshake-v1')
     RETURNING id`,
    [
      randomUUID(),
      attempt.runId,
      attempt.trackedProductId,
      attempt.attemptNumber,
      attempt.outcome,
      attempt.errorCode ?? null,
      attempt.errorMessage ?? null,
      attempt.httpStatus ?? null,
      attempt.durationMs ?? null,
    ],
  );
  return (one<{ id: string }>(result)).id;
}

export interface SuccessfulAttempt extends Omit<NonSuccessAttempt, 'outcome' | 'errorCode' | 'errorMessage' | 'httpStatus'> {
  outcome: 'success';
  price: number;
  stock: string;
}

/**
 * One statement, one round trip: the attempt row and its history projection
 * are written together, so a crash cannot leave a valued success row without
 * its history twin (or vice versa) for the CSV join to disagree about.
 */
export async function recordSuccessfulAttempt(
  db: Queryable,
  attempt: SuccessfulAttempt,
): Promise<string> {
  const result = await db.query(
    `WITH a AS (
       INSERT INTO scrape_attempts
         (id, scrape_run_id, tracked_product_id, attempt_number, outcome,
          price, stock, duration_ms, fetch_strategy, parser_version)
       VALUES ($1, $2, $3, $4, 'success', $5::numeric, $6, $7, 'http', 'store-handshake-v1')
       RETURNING id, tracked_product_id
     ),
     h AS (
       INSERT INTO price_stock_history (id, scrape_attempt_id, tracked_product_id, price, stock)
       SELECT $8, id, tracked_product_id, $5::numeric, $6 FROM a
       RETURNING scrape_attempt_id
     )
     SELECT id FROM a`,
    [
      randomUUID(),
      attempt.runId,
      attempt.trackedProductId,
      attempt.attemptNumber,
      attempt.price,
      attempt.stock,
      attempt.durationMs ?? null,
      randomUUID(),
    ],
  );
  return (one<{ id: string }>(result)).id;
}

export async function getTrackedProduct(
  db: Queryable,
  id: string,
): Promise<TrackedProductRow | null> {
  const result = await db.query(
    `SELECT id, store_product_id, product_name, selected_option, product_url, is_active
     FROM tracked_products WHERE id = $1`,
    [id],
  );
  const [row] = rows<Record<string, unknown>>(result);
  if (row === undefined) return null;
  if (
    typeof row['id'] !== 'string' ||
    typeof row['store_product_id'] !== 'string' ||
    typeof row['product_name'] !== 'string' ||
    typeof row['selected_option'] !== 'string' ||
    typeof row['product_url'] !== 'string'
  ) {
    throw new Error('tracked product row failed validation');
  }
  return {
    id: row['id'],
    store_product_id: row['store_product_id'],
    product_name: row['product_name'],
    selected_option: row['selected_option'],
    product_url: row['product_url'],
    is_active: row['is_active'] === true,
  };
}

export async function getLatestValidated(
  db: Queryable,
  trackedProductId: string,
): Promise<{ price: number; stock: string; observed_at: string } | null> {
  const result = await db.query(
    `SELECT price, stock, observed_at FROM v_latest_validated
     WHERE tracked_product_id = $1`,
    [trackedProductId],
  );
  const [row] = rows<{ price: unknown; stock: string; observed_at: string }>(result);
  if (row === undefined) return null;
  const price = toPrice(row.price);
  if (price === null) throw new Error('latest validated row has null price');
  return { price, stock: row.stock, observed_at: row.observed_at };
}

export async function getHistory(
  db: Queryable,
  trackedProductId: string,
  limit: number,
): Promise<HistoryRow[]> {
  const result = await db.query(
    `SELECT price, stock, observed_at FROM price_stock_history
     WHERE tracked_product_id = $1 ORDER BY observed_at DESC LIMIT $2`,
    [trackedProductId, limit],
  );
  return rows<{ price: unknown; stock: string; observed_at: string }>(result).map((row) => {
    const price = toPrice(row.price);
    if (price === null) throw new Error('history row has null price');
    return { price, stock: row.stock, observed_at: row.observed_at };
  });
}

export async function getAttemptLog(
  db: Queryable,
  trackedProductId: string,
  limit: number,
): Promise<AttemptLogRow[]> {
  const result = await db.query(
    `SELECT attempt_number, attempted_at, outcome, price, stock,
            http_status, error_code, error_message
     FROM scrape_attempts WHERE tracked_product_id = $1
     ORDER BY attempted_at DESC, attempt_number DESC LIMIT $2`,
    [trackedProductId, limit],
  );
  return rows<{
    attempt_number: number;
    attempted_at: string;
    outcome: string;
    price: unknown;
    stock: string | null;
    http_status: number | null;
    error_code: string | null;
    error_message: string | null;
  }>(result).map((row) => ({ ...row, price: toPrice(row.price) }));
}

export async function getExportRows(db: Queryable): Promise<ExportRow[]> {
  const result = await db.query(
    `SELECT product_id, product_name, selected_option, timestamp,
            price, stock, outcome, attempt_number
     FROM v_scrape_attempt_export ORDER BY timestamp, attempt_number`,
  );
  return rows<ExportRow>(result);
}
