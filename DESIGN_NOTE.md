# Design Note — INE Product Price Tracker

## 1. System thesis

Closed-loop measurement system: user intent (track product+option) → scheduled
control (external cron every 2h) → scrape (HTTP handshake) → validation gate →
observation (price_stock_history) or failure evidence (scrape_attempts) →
projections (dashboard cards, CSV). Only fully validated observations become
history; failures stay visible and never overwrite known-good values.

## 2. Storefront observations

- Product URL: `https://demo.inelabteamdev.com/item/<numericId>`; ID numeric.
- Catalog API: `/api/v2/listings` paginated; item API `/api/v2/items/<id>`;
  quote API per option returns `{ price, stock }`.
- Options: exact IDs `o1..oN` with labels; axis name (e.g. bundle) shown.
- Price: integer minor units (₹); stock: text count (`"0"` = out of stock).
- Async behavior: price loads after short delay; quote endpoint is the stable
  read (no HTML parsing needed).
- Slow/error behavior: occasional 5xx / timeouts / 429; transient vs terminal
  split by code. Pointer-gate automation check rejects headless browsers on
  some paths (OBS-20260925-003) — part of why HTTP won.
- HTTP + JSON sufficient: verified against fixtures + live store. No page
  requires JS rendering for price/stock.

## 3. Architecture

- Control plane: cron-job.org → `POST /api/internal/scrape-all` (Bearer).
- Sensing plane: `scrapeProduct` (catalog → handshake → quote → validate).
- Evidence plane: Postgres (attempts + history, atomic CTE write), views.
- Presentation plane: React dashboard (search → track → cards → history/log),
  CSV export as direct view projection.

## 4. Scraping strategy

HTTP-first: `fetchJson` item → `parseStoreItem` → `matchOption` (exact ID) →
`acquireQuote` → validate price (>0 finite) + stock (non-empty) + identity.
Browser fallback deliberately NOT implemented (DEC-0008): the gate defeats it
and the handshake API gives the same data cheaper. Headed mode exists only as
an observability wrapper (`tools/headed-scrape.ts`) for the recording.

## 5. Reliability strategy

- 15s upstream timeout; max 3 attempts; backoff with jitter (1s/2s/4s cap).
- Transient: `timeout`, `connection_reset`, `http_429`, `http_5xx` → `retried`.
- Terminal: `item_not_found`, `handshake_drift`, validation/option codes → `failed`.
- Runner owns `retried`-never-last; DB CHECK owns success-carries-values.
- Batch continues past single-target failure; run row carries counts.
- Latest-good protected: history inserts only on success; dashboard reads
  `v_latest_validated` + separate `lastScrape`.
- Change detection: `GET /api/change-events` surfaces terminal structure
  codes (`handshake_drift`, option/validation codes) as review flags.

## 6. Scheduling

External 2h trigger (`0 */2 * * *`) because free-tier backends sleep; no
in-process loop exists. Per-product `scrape_interval_hours` (1–168, default 2)
skips recently-scraped targets honestly (`skipped` in response).

## 7. Data integrity

Attempts (every network try, nullable price/stock) vs history (successes only,
UNIQUE FK to producing attempt). CSV = LEFT JOIN view: non-success rows empty
by construction. Per-column CHECK (stronger than spec formula) rejects
partial-value rows.

## 8. Observability and evidence

Run IDs group invocations; attempt rows carry number/timestamp/outcome/code;
fixtures pin store shapes; headed script narrates retries; CSV reconciles
1:1 with the log.

## 9. Trade-offs

- HTTP over browser: cheaper, faster, gate-proof; accepted risk = handshake
  drift (surfaced, not hidden).
- Pooler transaction mode: no prepared statements/multi-statement txns; all
  queries single-round-trip parameterized.
- RLS off, service-key-only: backend is the sole DB client by design.
- No re-arch of live-proven `acquireQuote`/`runScrape` during audit fixes.
- Alerts in-app first; SendGrid optional hook only (no email dependency).

## 10. AI tool usage

- Initial mistake #1 — 32-char hashes: suggested short password/hash truncations.
  Wrong: collision-prone, weak auth. Detected in review; corrected to full
  SHA-256 timing-safe compare (`internal.ts`). Verified by 401 tests.
- Initial mistake #2 — string itemId: passed raw strings into numeric paths.
  Wrong: pg-mem folds types, prod Postgres refuses text→numeric. Detected via
  typecheck/test; corrected with numeric validation + `$n::numeric` casts.
- Initial mistake #3 — weak CHECK: single-equivalence CHECK admitted failed
  rows with one value set. Detected by invariant review; corrected to
  per-column equivalences (DEC-0009). Verified by schema tests.
- Initial mistake #4 — env-PUT replace: Render REST PUT replaces the whole
  env-var set; partial update wiped secrets once. Detected on deploy;
  corrected with full-set PUT + `npm ci` reproducible builds. Verified Live.
- Initial mistake #5 — IPv6-only host: assumed direct DB host reachable from
  Render free (no IPv6 egress → ENETUNREACH). Detected via DoH A/AAAA split;
  corrected to `ap-northeast-2` pooler host. Verified by seed 3/3.

## 11. Known limitations

- Free-tier cold starts (~1–5s); cron keeps data fresh, not instant.
- Interval skips mean sparse histories for high-interval targets by design.
- Headed demo is local-only (Render skips browser download).
- DB password traveled through chat/shell during ops: rotate after submission.
