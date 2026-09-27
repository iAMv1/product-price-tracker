# cron-job.org — primary 2-hour trigger

One job. Everything else is a backstop.

- Title: `ppt-scrape-all`
- URL: `https://ppt-backend-lyiv.onrender.com/api/internal/scrape-all`
- Schedule: Custom `0 */2 * * *` (top of every even UTC hour), timezone UTC
- Request method: POST, empty JSON body `{}`
- Headers: `Authorization: Bearer <CRON_SECRET>` (copy from the backend env; never commit it)
- Request timeout: 30s (the endpoint answers 202 immediately, then executes)

Expected response: `202 {"dispatched":true,"runId":"…","due":N,…}`.
`{"dispatched":false,"reason":"lease-held"}` is also healthy — it means a
rescue run already holds the single-flight lease.

If the title/URL ever change, update `HEADED_RECORDING.md` and the Docs
schedule section in the same commit.
