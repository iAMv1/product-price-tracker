-- 003: deployment usage telemetry (owner visibility into who uses this backend).
-- Stores only origin/referrer hosts + path: no IPs, no user agents, no
-- fingerprints. The question it answers is "which deployments/sites hit my
-- API", not "who are the visitors".
CREATE TABLE IF NOT EXISTS usage_pings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  origin_host TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  referrer_host TEXT NOT NULL DEFAULT '',
  CONSTRAINT usage_pings_host_check CHECK (
    char_length(origin_host) <= 253 AND char_length(referrer_host) <= 253
  ),
  CONSTRAINT usage_pings_path_check CHECK (char_length(path) <= 512)
);
CREATE INDEX IF NOT EXISTS usage_pings_occurred_at_idx
  ON usage_pings (occurred_at DESC);
