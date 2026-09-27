-- 004_sku: pin the store's item SKU on tracked rows (trust-on-first-use).
-- NULL means unpinned (legacy rows gain their pin on the next scrape);
-- a pin, once set, is never rewritten by application code.
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS sku TEXT;
