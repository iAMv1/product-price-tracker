-- Reproducible Supabase pg_cron layer for the tracker.
--
-- Run this file in the Supabase SQL editor (or psql) AFTER replacing the
-- placeholders. Never commit real secrets here: CRON_SECRET only ever lives
-- in the backend environment and the cron-job.org dashboard.
--
-- Placeholders:
--   __BACKEND_URL__  e.g. https://ppt-backend-lyiv.onrender.com
--   __CRON_SECRET__  same value as the backend CRON_SECRET env var
--
-- Requires the pg_cron and pg_net extensions (Supabase: Database > Extensions).

-- 1. Keep-alive: ping /health every 10 minutes so Render's free instance
--    is warm when the 2-hour scrape lands. Dashes at :02,:12,... to avoid
--    landing exactly on a scrape tick.
SELECT cron.schedule(
  'ppt-keepalive',
  '2-59/10 * * * *',
  $$SELECT net.http_get('__BACKEND_URL__/health')$$
);

-- 2. Rescue: re-fire the full scrape at :50 past every even UTC hour. If the
--    primary cron-job.org trigger dies entirely, this still lands inside the
--    same 2-hour window; the due-check turns any overlap with a primary run
--    into an honest skipped no-op (lease-held) instead of double work.
SELECT cron.schedule(
  'ppt-rescue-scrape',
  '50 */2 * * *',
  $$SELECT net.http_post(
    '__BACKEND_URL__/api/internal/scrape-all',
    '{}'::jsonb,
    '{}'::jsonb,
    '{"Authorization": "Bearer __CRON_SECRET__"}'::jsonb,
    10000
  )$$
);

-- Verify:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'ppt-%';
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
