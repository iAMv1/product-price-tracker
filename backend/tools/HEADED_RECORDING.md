# Headed observable run — recording guide (2–4 min)

## Command

```bash
cd backend
npx playwright install chromium   # one-time, local only (Render skips this)
npm run headed:scrape             # default: 2626/o1 2229/o2 2092/o2
# or: npx tsx tools/headed-scrape.ts 2626 o1
# CI/headless: HEADLESS=1 npx tsx tools/headed-scrape.ts 2626 o1
```

## What the grader sees

1. A headed Chromium window opens the real store page
   (`https://demo.inelabteamdev.com/item/<id>`) with visible navigation.
2. The terminal runs the REAL production scraper (`scrapeProduct`) against
   the same product/option, printing per-attempt lines:
   - `SUCCESS price=… stock=… (Nms)` on the happy path;
   - `<errorCode> transient=true/false …` on slow/failing responses, with
     visible backoff (`1000/2000/4000ms`) before retries;
   - `terminal failure recorded honestly, no invented values` when the
     budget is exhausted.
3. The browser window stays open while retries happen, so slow responses
   are watchable in both places at once.

## Automated recording (used for the submission video)

`backend/tools/recording-run.ts` drives the whole 2–4 min demonstration unattended:
intro → A dashboard (browser) → B real scrapes (terminal, 3 products) → C failing
response (`2626 o99` → `option_not_found`, recorded honestly) → D retried rows in
the scrape log + CSV export (browser) → E reliability recap (terminal). Each segment
requests the stage by writing `artifacts/recordings/.flip`; the capture driver
(`record-driver.ps1`) owns the window swap loop — one full-screen window at a time,
`SetWindowPos` topmost, terminal handle picked at launch — while ffmpeg records the
desktop with `CreateNoWindow` and a fragmented mp4 (survives the hard stop):

```bash
powershell -ExecutionPolicy Bypass -File record-driver.ps1   # ~2.5 min, owns capture + swaps
# the driver launches: cd backend && npx tsx tools/recording-run.ts
```

## Suggested 3-minute script

- 0:00–0:30 — show the command + dashboard with 3 tracked targets.
- 0:30–1:30 — headed run, happy path: page settles, `SUCCESS` line, history
  row appears on dashboard refresh.
- 1:30–2:30 — slow/failing path: throttle network (DevTools → Slow 3G) or
  re-run during a store 5xx spell; show `http_5xx transient=true`, backoff,
  `retried` row in the scrape log, then recovery `success`.
- 2:30–3:00 — CSV export: the retried row is present with empty price/stock,
  proving honest history.

## Notes

- Production price path is plain HTTP (DEC-0008); the browser is an
  observability wrapper only and never writes prices.
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` stays set on Render — headed runs
  are local/demo only by design.
