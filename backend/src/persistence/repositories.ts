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
  scrape_interval_hours: number;
  /** Present when loaded through getTrackedProduct: seeded demo protection. */
  is_demo_seeded?: boolean;
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
    scrapeIntervalHours?: number;
  },
): Promise<TrackedProductRow> {
  const interval = clampIntervalHours(input.scrapeIntervalHours);
  const result = await db.query(
    `INSERT INTO tracked_products (id, store_product_id, product_name, selected_option, product_url, scrape_interval_hours)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, store_product_id, product_name, selected_option, product_url, is_active, scrape_interval_hours`,
    [randomUUID(), input.storeProductId, input.productName, input.selectedOption, input.productUrl, interval],
  );
  return one<TrackedProductRow>(result);
}

export function clampIntervalHours(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 168) return 2;
  return n;
}

export async function updateTrackedInterval(
  db: Queryable,
  id: string,
  hours: number,
): Promise<boolean> {
  const result = await db.query(
    'UPDATE tracked_products SET scrape_interval_hours = $1, updated_at = now() WHERE id = $2',
    [clampIntervalHours(hours), id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listActiveTrackedProducts(
  db: Queryable,
): Promise<TrackedProductRow[]> {
  const result = await db.query(
    `SELECT id, store_product_id, product_name, selected_option, product_url, is_active, scrape_interval_hours
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

/**
 * Unique-constraint violation (SQLSTATE 23505). Duplicate-recovery paths in
 * the track routes must catch ONLY this — a connection outage or constraint
 * bug must not be mistaken for "row already exists". The message fallback
 * exists because pg-mem signals uniqueness in the message, not the code.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === '23505') return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    /duplicate key|unique constraint/i.test(message)
  );
}

/** Liveness tick: written between targets while a dispatched run executes. */
export async function heartbeatScrapeRun(db: Queryable, runId: string): Promise<void> {
  await db.query(`UPDATE scrape_runs SET last_heartbeat_at = now() WHERE id = $1`, [runId]);
}

/** A dispatched run whose execution escaped with an error: mark failed. */
export async function failScrapeRun(db: Queryable, runId: string): Promise<void> {
  await db.query(
    `UPDATE scrape_runs
     SET status = 'failed', completed_at = now(), last_heartbeat_at = now()
     WHERE id = $1 AND status IN ('queued', 'running')`,
    [runId],
  );
}

/**
 * Stale-run recovery: runs left 'queued'/'running' by a dead process have no
 * recent heartbeat (COALESCE covers rows written before the column existed).
 * Returns how many runs were abandoned — surfaced in the scheduler response
 * so a crash is visible evidence, never a silent gap.
 */
export async function abandonStaleRuns(db: Queryable, staleMinutes: number): Promise<number> {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const result = await db.query(
    `UPDATE scrape_runs
     SET status = 'abandoned', completed_at = now()
     WHERE status IN ('queued', 'running')
       AND COALESCE(last_heartbeat_at, started_at) < $1
     RETURNING id`,
    [cutoff],
  );
  return result.rows.length;
}

/**
 * Single-flight lease: takes `key` if free or expired, else reports another
 * live owner. Expiry guarantees a crashed owner cannot wedge the schedule;
 * renewLease extends the window while work actually proceeds.
 */
export async function acquireLease(
  db: Queryable,
  key: string,
  owner: string,
  ttlMs: number,
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + ttlMs).toISOString();
  const takeover = await db.query(
    `UPDATE scheduler_leases SET owner_id = $2, leased_until = $3
     WHERE lease_key = $1 AND leased_until < $4
     RETURNING lease_key`,
    [key, owner, untilIso, nowIso],
  );
  if (takeover.rows.length > 0) return true;
  try {
    const inserted = await db.query(
      `INSERT INTO scheduler_leases (lease_key, owner_id, leased_until)
       VALUES ($1, $2, $3) RETURNING lease_key`,
      [key, owner, untilIso],
    );
    return inserted.rows.length > 0;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

export async function renewLease(
  db: Queryable,
  key: string,
  owner: string,
  ttlMs: number,
): Promise<void> {
  await db.query(
    `UPDATE scheduler_leases SET leased_until = $3
     WHERE lease_key = $1 AND owner_id = $2`,
    [key, owner, new Date(Date.now() + ttlMs).toISOString()],
  );
}

export async function releaseLease(
  db: Queryable,
  key: string,
  owner: string,
): Promise<void> {
  await db.query(
    `DELETE FROM scheduler_leases WHERE lease_key = $1 AND owner_id = $2`,
    [key, owner],
  );
}

/**
 * Re-track after a soft untrack: reactivate the dormant row instead of
 * failing the unique-identity constraint. Evidence (attempts/history) stays
 * attached across untrack -> re-track cycles.
 */
export async function reactivateTrackedByIdentity(
  db: Queryable,
  identity: { storeProductId: string; selectedOption: string; productUrl: string },
): Promise<TrackedProductRow | null> {
  const result = await db.query(
    `UPDATE tracked_products
     SET is_active = TRUE, updated_at = now()
     WHERE store_product_id = $1 AND selected_option = $2 AND product_url = $3
       AND is_active = FALSE
     RETURNING id, store_product_id, product_name, selected_option, product_url,
               is_active, scrape_interval_hours`,
    [identity.storeProductId, identity.selectedOption, identity.productUrl],
  );
  const [row] = rows<TrackedProductRow>(result);
  return row ?? null;
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
    `SELECT id, store_product_id, product_name, selected_option, product_url, is_active,
            scrape_interval_hours, is_demo_seeded
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
  const interval = typeof row['scrape_interval_hours'] === 'number' ? row['scrape_interval_hours'] : 2;
  return {
    id: row['id'],
    store_product_id: row['store_product_id'],
    product_name: row['product_name'],
    selected_option: row['selected_option'],
    product_url: row['product_url'],
    is_active: row['is_active'] === true,
    scrape_interval_hours: interval,
    is_demo_seeded: row['is_demo_seeded'] === true,
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

export interface LatestAttempt {
  trackedProductId: string;
  attemptedAt: string;
  outcome: string;
  errorCode: string | null;
}

/**
 * Latest attempt per target in ONE query (scheduler + alerts batch path).
 * Grouped in JS: keeps pg-mem compatibility (no DISTINCT ON / window fns).
 */
export async function getLatestAttempts(db: Queryable): Promise<LatestAttempt[]> {
  const result = await db.query(
    `SELECT tracked_product_id, attempted_at, outcome, error_code
     FROM scrape_attempts ORDER BY attempted_at DESC, attempt_number DESC`,
  );
  const seen = new Set<string>();
  const out: LatestAttempt[] = [];
  for (const row of rows<{
    tracked_product_id: string;
    attempted_at: string;
    outcome: string;
    error_code: string | null;
  }>(result)) {
    if (seen.has(row.tracked_product_id)) continue;
    seen.add(row.tracked_product_id);
    out.push({
      trackedProductId: row.tracked_product_id,
      attemptedAt: row.attempted_at,
      outcome: row.outcome,
      errorCode: row.error_code,
    });
  }
  return out;
}

export interface RecentHistory {
  trackedProductId: string;
  price: number;
  stock: string;
  observedAt: string;
}

/** Last two validated observations per active target, one query (alerts path). */
export async function getRecentHistories(
  db: Queryable,
  trackedProductIds: string[],
): Promise<RecentHistory[]> {
  if (trackedProductIds.length === 0) return [];
  const wanted = new Set(trackedProductIds);
  const result = await db.query(
    `SELECT tracked_product_id, price, stock, observed_at
     FROM price_stock_history ORDER BY tracked_product_id, observed_at DESC`,
  );
  const counts = new Map<string, number>();
  const out: RecentHistory[] = [];
  for (const row of rows<{
    tracked_product_id: string;
    price: unknown;
    stock: string;
    observed_at: string;
  }>(result)) {
    if (!wanted.has(row.tracked_product_id)) continue;
    const n = counts.get(row.tracked_product_id) ?? 0;
    if (n >= 2) continue;
    counts.set(row.tracked_product_id, n + 1);
    const price = toPrice(row.price);
    if (price === null) throw new Error('history row has null price');
    out.push({
      trackedProductId: row.tracked_product_id,
      price,
      stock: row.stock,
      observedAt: row.observed_at,
    });
  }
  return out;
}

export interface ScrapeRunSummary {
  id: string;
  triggerType: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  targetCount: number;
  successCount: number;
  retriedCount: number;
  failureCount: number;
}

/** Recent invocations: the observable unattended-cadence feed. */
export async function listRuns(db: Queryable, limit: number): Promise<ScrapeRunSummary[]> {
  const safe = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 50) : 20;
  const result = await db.query(
    `SELECT id, trigger_type, started_at, completed_at, status,
            target_count, success_count, retried_count, failure_count
     FROM scrape_runs ORDER BY started_at DESC LIMIT $1`,
    [safe],
  );
  return rows<{
    id: string;
    trigger_type: string;
    started_at: string;
    completed_at: string | null;
    status: string;
    target_count: number;
    success_count: number;
    retried_count: number;
    failure_count: number;
  }>(result).map((row) => ({
    id: row.id,
    triggerType: row.trigger_type,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    targetCount: row.target_count,
    successCount: row.success_count,
    retriedCount: row.retried_count,
    failureCount: row.failure_count,
  }));
}
