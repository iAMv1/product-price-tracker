-- 005_option_label: display label for the tracked option (write-once).
-- NULL means unseen (legacy rows gain it on the next success); never
-- rewritten by application code, and never part of scrape identity.
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS option_label TEXT;
