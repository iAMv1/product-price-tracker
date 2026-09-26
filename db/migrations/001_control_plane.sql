-- 001_control_plane.sql — bring a pre-existing database up to the
-- control-plane revision (dispatch scheduler, evidence integrity, indexes).
-- Idempotent: safe to re-run. Apply with:
--   psql "$DATABASE_URL" -f db/migrations/001_control_plane.sql
-- or paste into the Supabase SQL editor.
--
-- Additive-only against a database still running the previous backend, so
-- deploying this migration BEFORE the new backend code is safe in both
-- directions (old code writes only 'running'/'completed').

-- ---------------------------------------------------------------------------
-- 1. Run lifecycle: queued/failed/abandoned become legal states, heartbeat
--    column added (stale-run recovery depends on both).
-- ---------------------------------------------------------------------------
ALTER TABLE scrape_runs DROP CONSTRAINT IF EXISTS scrape_runs_status_check;
ALTER TABLE scrape_runs ADD CONSTRAINT scrape_runs_status_check
  CHECK (status IN ('queued', 'running', 'completed', 'failed', 'abandoned'));
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Single-flight scheduler lease (no overlapping batches).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduler_leases (
  lease_key TEXT PRIMARY KEY,
  owner_id UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  leased_until TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- 3. Seeded-demo protection flag.
-- ---------------------------------------------------------------------------
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS is_demo_seeded
  BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 4. Temporal indexes for per-target latest/recent reads.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_product_time
  ON scrape_attempts (tracked_product_id, attempted_at DESC, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_price_stock_history_product_time
  ON price_stock_history (tracked_product_id, observed_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Provenance: history row must reference the (attempt, target) pair that
--    actually produced it.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE scrape_attempts
    ADD CONSTRAINT scrape_attempts_id_product_unique UNIQUE (id, tracked_product_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE price_stock_history
  DROP CONSTRAINT IF EXISTS price_stock_history_scrape_attempt_id_fkey;
ALTER TABLE price_stock_history
  DROP CONSTRAINT IF EXISTS price_stock_history_tracked_product_id_fkey;
DO $$
BEGIN
  ALTER TABLE price_stock_history
    ADD CONSTRAINT price_stock_history_provenance_fk
    FOREIGN KEY (scrape_attempt_id, tracked_product_id)
    REFERENCES scrape_attempts (id, tracked_product_id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Deterministic latest-validated view (timestamp ties -> MAX(id) winner).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 7. Run ONCE on production (not part of schema.sql): flag the currently
--    active tracked products as seeded demo targets. Re-running would also
--    flag products visitors tracked later — keep this one-shot.
-- ---------------------------------------------------------------------------
-- UPDATE tracked_products SET is_demo_seeded = TRUE WHERE is_active = TRUE;
