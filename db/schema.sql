-- Product Price Tracker — Supabase schema (DB-001)
--
-- Chain of evidence: tracked_products -> scrape_runs -> scrape_attempts
--   -> price_stock_history (validated observations only).
-- Canonical semantics: SYSTEM_MODEL.md section 5, PROJECT_SPEC.md section 6,
-- DEC-0002 / DEC-0003 / DEC-0005, PRODUCT_ARCHITECTURE_AND_FLOW.md sections 9/19.
--
-- Apply: paste into the Supabase SQL editor, or
--   psql "$DATABASE_URL" -f db/schema.sql
-- The script is idempotent (CREATE TABLE IF NOT EXISTS) so re-running a
-- deploy is safe. RLS is intentionally not enabled: all access goes through
-- the backend service key, never directly from the browser.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- tracked_products: the user's durable tracking intent.
-- Identity = (store_product_id, selected_option, product_url).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tracked_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  selected_option TEXT NOT NULL,
  product_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Seeded demo targets are protected from public deletion/deactivation so the
  -- shared submission dashboard keeps its tracked set (open writes stay open
  -- for everything visitors track themselves).
  is_demo_seeded BOOLEAN NOT NULL DEFAULT FALSE,
  scrape_interval_hours INTEGER NOT NULL DEFAULT 2
    CONSTRAINT tracked_products_interval_check CHECK (scrape_interval_hours BETWEEN 1 AND 168),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tracked_products_identity_unique
    UNIQUE (store_product_id, selected_option, product_url)
);

-- ---------------------------------------------------------------------------
-- scrape_runs: one row per scheduler / manual / headed invocation.
-- Groups every product-level attempt triggered by a single invocation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scrape_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type TEXT NOT NULL
    CONSTRAINT scrape_runs_trigger_type_check
    CHECK (trigger_type IN ('scheduled', 'manual', 'headed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CONSTRAINT scrape_runs_status_check
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'abandoned')),
  -- Liveness: the owning process touches this between targets. A run whose
  -- heartbeat goes stale (process died mid-run) is recovered to 'abandoned'
  -- by the next scheduler invocation, so no row can stay 'running' forever.
  last_heartbeat_at TIMESTAMPTZ,
  target_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT scrape_runs_target_count_check CHECK (target_count >= 0),
  success_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT scrape_runs_success_count_check CHECK (success_count >= 0),
  retried_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT scrape_runs_retried_count_check CHECK (retried_count >= 0),
  failure_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT scrape_runs_failure_count_check CHECK (failure_count >= 0)
);

-- ---------------------------------------------------------------------------
-- scheduler_leases: single-flight lease for the scheduled batch (SCHED-001).
-- Overlapping scheduler edges (cron timeout + retry, keep-alive-triggered
-- wake + pg_cron rescue) must never double-scrape: an invocation first takes
-- this lease and skips with an honest no-op if another owner's lease is live.
-- Leases expire (leased_until), so a crashed owner cannot wedge the schedule;
-- the owning invocation renews it via run heartbeats while work proceeds.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduler_leases (
  lease_key TEXT PRIMARY KEY,
  owner_id UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  leased_until TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- scrape_attempts: ONE ROW PER NETWORK ATTEMPT, including failures.
-- This is the single source of truth for every scrape outcome, so the CSV
-- export is a direct projection of this table and cannot disagree with the log.
--
-- outcome describes one fetch/parse/validate attempt:
--   success — validated observation, price AND stock populated, final row for
--             this product in this run.
--   retried — transient failure, price AND stock NULL, NEVER the last row for
--             this product in this run (a later attempt_number must follow).
--   failed  — terminal failure or last permitted attempt, price AND stock NULL,
--             final row for this product in this run.
-- The CHECK below enforces: only success rows carry values.
-- The retried-is-never-final rule cannot be expressed as a single-table
-- constraint; the runner enforces it and an integration test asserts it
-- (SCRAPE-002). handshake_drift (storefront redeploy) is terminal -> 'failed'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scrape_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_run_id UUID NOT NULL REFERENCES scrape_runs (id) ON DELETE CASCADE,
  tracked_product_id UUID NOT NULL REFERENCES tracked_products (id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL
    CONSTRAINT scrape_attempts_attempt_number_check CHECK (attempt_number >= 1),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT NOT NULL
    CONSTRAINT scrape_attempts_outcome_check
    CHECK (outcome IN ('success', 'retried', 'failed')),
  price NUMERIC,
  stock TEXT,
  http_status INTEGER,
  duration_ms INTEGER
    CONSTRAINT scrape_attempts_duration_check
    CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_code TEXT,
  error_message TEXT,
  fetch_strategy TEXT NOT NULL DEFAULT 'http'
    CONSTRAINT scrape_attempts_fetch_strategy_check
    CHECK (fetch_strategy IN ('http', 'browser')),
  parser_version TEXT,
  CONSTRAINT scrape_attempts_run_product_attempt_unique
    UNIQUE (scrape_run_id, tracked_product_id, attempt_number),
  -- Provenance half 1: lets history carry a composite FK proving the
  -- attempt and the target on a history row belong together (DEC-0002).
  CONSTRAINT scrape_attempts_id_product_unique
    UNIQUE (id, tracked_product_id),
  -- Invariant 1 (SYSTEM_MODEL.md section 5): only success rows carry
  -- price/stock; every non-success row stores NULL for both. This is two
  -- equivalences, not one: a single `(outcome='success') = (price AND stock)`
  -- would still admit a failed row with exactly one of the two set (false =
  -- false). Each column is therefore tied to success independently, so no
  -- non-success row can carry EITHER value (DEC-0003's stronger rule).
  CONSTRAINT scrape_attempts_success_values_check
    CHECK (
      ((outcome = 'success') = (price IS NOT NULL))
      AND ((outcome = 'success') = (stock IS NOT NULL))
    )
);

-- fetch_strategy 'browser' is a deliberately unused enum member (DEC-0008):
-- the pointer gate rejects automation (OBS-20260925-003), so no browser runs
-- anywhere in the production path. The value is kept so historical intent is
-- explicit if the headed-demonstration instrument ever writes attempts.
COMMENT ON COLUMN scrape_attempts.fetch_strategy IS
  'http is the production price path; browser is an unused enum member kept for the headed-demonstration instrument (DEC-0008).';

-- ---------------------------------------------------------------------------
-- price_stock_history: validated successful observations ONLY.
-- One row per successful attempt, linked by a UNIQUE FK to the producing
-- attempt, so history cannot contain an observation no attempt produced and
-- cannot be padded. Failed scrapes never overwrite the latest known-good row:
-- they insert no row here at all.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_stock_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_attempt_id UUID NOT NULL UNIQUE,
  tracked_product_id UUID NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  price NUMERIC NOT NULL
    CONSTRAINT price_stock_history_price_check CHECK (price > 0),
  stock TEXT NOT NULL,
  -- Provenance (DEC-0002): the producing attempt AND the target must match
  -- one (id, tracked_product_id) pair — a history row can never credit an
  -- attempt that belongs to a different product.
  CONSTRAINT price_stock_history_provenance_fk
    FOREIGN KEY (scrape_attempt_id, tracked_product_id)
    REFERENCES scrape_attempts (id, tracked_product_id) ON DELETE CASCADE
);

-- Temporal reads (latest attempt / recent history per target) are indexed so
-- they stay O(log n) as evidence accumulates; grouping stays in JS for
-- pg-mem compatibility but never scans unrelated targets' rows.
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_product_time
  ON scrape_attempts (tracked_product_id, attempted_at DESC, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_price_stock_history_product_time
  ON price_stock_history (tracked_product_id, observed_at DESC);

-- ---------------------------------------------------------------------------
-- Projections (dashboard / export read these, never the raw tables directly).
-- ---------------------------------------------------------------------------

-- Latest validated observation per tracked product ("NOW" + "WHEN" cards).
-- Aggregate + join only (no DISTINCT ON, no correlated subquery) so the
-- definition runs unchanged on Supabase and in the pg-mem schema test.
-- Timestamp ties are deterministic: the winner among rows sharing
-- MAX(observed_at) is the one with MAX(id::text), so a tie can never return
-- two rows or flip between reads (text cast keeps the aggregate portable to
-- pg-mem, which lacks min/max(uuid)). OR REPLACE keeps re-deploys idempotent.
CREATE OR REPLACE VIEW v_latest_validated AS
SELECT
  h.tracked_product_id,
  h.price,
  h.stock,
  h.observed_at,
  h.scrape_attempt_id
FROM price_stock_history h
JOIN (
  SELECT tracked_product_id, MAX(observed_at) AS max_observed_at
  FROM price_stock_history
  GROUP BY tracked_product_id
) m ON m.tracked_product_id = h.tracked_product_id
  AND m.max_observed_at = h.observed_at
JOIN (
  -- Winner per product among the tied "latest" rows: highest id as text.
  SELECT tracked_product_id, max_observed_at, MAX(id_text) AS winner_id
  FROM (
    SELECT h2.tracked_product_id, m2.max_observed_at, h2.id::text AS id_text
    FROM price_stock_history h2
    JOIN (
      SELECT tracked_product_id, MAX(observed_at) AS max_observed_at
      FROM price_stock_history
      GROUP BY tracked_product_id
    ) m2 ON m2.tracked_product_id = h2.tracked_product_id
      AND m2.max_observed_at = h2.observed_at
  ) tied
  GROUP BY tracked_product_id, max_observed_at
) w ON w.tracked_product_id = h.tracked_product_id
  AND w.winner_id = h.id::text;

-- Audit-grade CSV source: one row per attempt, price/stock populated only
-- where a validated observation exists (LEFT JOIN). Non-success rows are
-- therefore empty by construction, not by export-code discipline.
CREATE OR REPLACE VIEW v_scrape_attempt_export AS
SELECT
  tp.store_product_id AS product_id,
  tp.product_name,
  tp.selected_option,
  sa.attempted_at AS timestamp,
  ph.price,
  ph.stock,
  sa.outcome,
  sa.attempt_number
FROM scrape_attempts sa
JOIN tracked_products tp ON tp.id = sa.tracked_product_id
LEFT JOIN price_stock_history ph ON ph.scrape_attempt_id = sa.id;
