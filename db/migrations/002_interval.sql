-- 002: per-product configurable scrape frequency (bonus).
-- Default 2h preserves the assignment schedule; UI/PATCH may set 1-168h.
-- Scheduler skips targets whose last attempt is newer than the interval.
ALTER TABLE tracked_products
  ADD COLUMN IF NOT EXISTS scrape_interval_hours INTEGER NOT NULL DEFAULT 2
  CONSTRAINT tracked_products_interval_check CHECK (scrape_interval_hours BETWEEN 1 AND 168);
