# Headed observable run — recording guide (2–4 min)

## Command (canonical)

One command runs the whole recording end to end — no external driver, no
wrapper script:

```bash
cd backend
npx playwright install chromium   # one-time, local only (Render skips this)
npm run record:headed             # = tsx tools/recording-run.ts
```

Quick probe without the recording (no DB, no state files):

```bash
npm run headed:scrape                           # default: 2626/o1 2229/o2 2092/o2
npx tsx tools/headed-scrape.ts 2626 o1          # ad-hoc pairs
HEADLESS=1 npx tsx tools/headed-scrape.ts 2626 o1   # CI/headless
```

## What the grader sees

1. A headed Chromium window opens the real store page
   (`https://demo.inelabteamdev.com/item/<id>`) with visible navigation.
2. The terminal runs the REAL production scraper through the REAL runner
   (`runAllTargets` from `src/scraper/runner.ts`), printing per-call lines
   and then the persisted attempt chain:
   - `attempt 1 -> success  price=… stock=…` on the happy path;
   - in ONE chain: `attempt 1 -> retried (http_5xx)` (injected demo 503,
     message says `HTTP 503`) followed by `attempt 2 -> success`, with the
     runner's own backoff + jitter (`1000/2000/4000ms` cap) between them;
   - `attempt 1 -> failed (option_not_found)` for `2626/o99`: terminal code,
     one honest `failed` row, price and stock left empty.
3. The browser window stays open while retries happen, so slow responses
   are watchable in both places at once.
4. The final terminal segment prints a summary of every attempt row the
   runner persisted for this run.

## Demo fault injection (`tools/fault-inject.ts`)

- `DEMO_FAULT=http-503-once` (default; `timeout-once` also supported) makes
  the FIRST scrape call fail with the same transient failure shape the real
  503/timeout paths produce (`http_5xx` / `timeout`, `transient: true`).
  Every later call delegates to the real scraper — the wrapper never fakes
  a success.
- The retry decision stays with the runner: the wrapper only supplies the
  transient failure, so `retried -> success` is the production retry path,
  not a hand-rolled loop.
- The wrapper **refuses to arm when `NODE_ENV === 'production'`** (and
  ignores unknown `DEMO_FAULT` values), logging the refusal instead.
- TOOLS-ONLY: it lives in `backend/tools/` and is never importable from
  `src/` (src only depends on src/; nothing under src/ references tools/).

`record:headed` sets `DEMO_FAULT=http-503-once` programmatically when unset;
override with e.g. `DEMO_FAULT=timeout-once npm run record:headed`.

## Safety guards

- **Database:** recording aborts before any write if `DATABASE_URL` is set
  and its host is not `localhost`/`127.0.0.1` — the recording must only ever
  touch the local dev database, never production. With no `DATABASE_URL`
  the runner persists into an in-memory schema database (rows still land in
  `scrape_attempts`; the printed summary comes from `getAttemptLog`).
- **State files:** `tools/recording-run.ts` creates
  `../artifacts/recordings/` (`mkdirSync … recursive`) before writing
  `.flip` (window-swap request: `terminal`/`browser`) and `.done` (ISO
  timestamp when the cut finishes). External capture tooling can watch
  those files; nothing in the repo depends on a driver script.

## Suggested 3-minute script

- 0:00–0:30 — show the command + dashboard with 3 tracked targets.
- 0:30–1:30 — headed run, happy path: page settles, `SUCCESS` line, history
  row appears on dashboard refresh.
- 1:30–2:30 — injected 503: `attempt 1 -> retried (http_5xx)`, visible
  backoff, `attempt 2 -> success` in the same chain; the scrape log shows
  the `retried` row with empty price/stock.
- 2:30–3:00 — CSV export: the retried row is present with empty price/stock,
  proving honest history.

## Notes

- Production price path is plain HTTP (DEC-0008); the browser is an
  observability wrapper only and never writes prices.
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` stays set on Render — headed runs
  are local/demo only by design.
