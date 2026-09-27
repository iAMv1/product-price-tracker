# Scheduler verification

Three layers, cheapest check first.

1. **Backend feed** — `GET /api/runs?limit=10`: expect a `completed` run with
   `triggerType: scheduled` roughly every 2 hours. Gaps mean all three layers
   below need checking, in order.
2. **Primary (cron-job.org)** — dashboard shows last execution time + HTTP
   status per run. Look for 202s (or 200 lease-held) at even UTC hours.
3. **Rescue (pg_cron)** — `SELECT * FROM cron.job_run_details ORDER BY
   start_time DESC LIMIT 5`: expect `:50` runs with status `succeeded`.
4. **Backup (GitHub Actions)** — the `/health` ping workflow runs every 5
   minutes; it only keeps the instance warm, it never scrapes.

Overlaps are safe by design: the second claimant gets `lease-held` and the
run before it is marked `abandoned` only if its heartbeat is older than 15
minutes, then re-scraped honestly by the due-check.
