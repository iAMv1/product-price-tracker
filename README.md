# Product Price Tracker

Track the price and stock of a specific option of a product on INE's mock storefront, on a
schedule, and keep an honest record of every attempt — including the ones that failed.

Search → pick a product → pick an option → track it. Every 2 hours an external scheduler
triggers the backend, which scrapes each active target, validates what came back, and stores
either a validated observation or a piece of failure evidence.

## The one rule everything else serves

> Only a fully validated observation can become historical price/stock data.

A failed scrape never overwrites the latest known-good value, and never invents a value to
look healthy. Failed attempts stay visible.

## Stack

| Layer | Choice | Deployed to |
|---|---|---|
| Frontend | React + TypeScript, Vite | Vercel |
| Backend | Node.js + Express + TypeScript | Render |
| Database | Supabase PostgreSQL | Supabase |
| Scheduler | External cron (cron-job.org) | — |

## Repository layout

```text
├── SOUL.md                 agent operating persona
├── project/                specification and architecture
│   ├── PRODUCT_ARCHITECTURE_AND_FLOW.md   ← system flow, data model, CSV contract
│   ├── SYSTEM_MODEL.md                    invariants, state machines, truth hierarchy
│   ├── PROJECT_SPEC.md                    requirements as contracts
│   ├── ARCHITECTURE.md                    control / sensing / evidence boundaries
│   └── IMPLEMENTATION_PLAN.md             evidence-driven build phases
├── harness/                agent control surface
│   ├── STATE.md                           ← read this first: where the project stands
│   ├── TASKS.yaml                         dependency-aware task backlog
│   ├── AGENTIC_HARNESS.md                 bootstrap, evidence ladder, memory protocol
│   └── AGENT_RULES.md                     repository guardrails
├── knowledge/              durable memory
│   ├── OBSERVATIONS.md                    what we established by observation
│   ├── DECISIONS.md                       choices, alternatives and why
│   ├── FAILURES.md                        approaches that did not work
│   └── VERIFICATION_LOG.md                what was actually run, and what it proved
├── artifacts/              diagrams and evidence
├── backend/                API + scrape orchestrator + scraper engine
├── frontend/               dashboard
└── db/                     migrations and schema
```

Start with `harness/STATE.md`. It names the active task, the invariants, and what is
already known versus still unknown.

## Local setup

Requires Node 22.13 or newer.

```bash
npm run install:all          # installs backend/ and frontend/
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
```

Run the two apps in separate terminals:

```bash
npm run dev:backend          # http://localhost:4000
npm run dev:frontend         # http://localhost:5173
```

In development Vite proxies `/api` and `/health` to the backend, so the browser stays
same-origin and CORS only matters in production.

## Scripts

| Command | Effect |
|---|---|
| `npm run install:all` | Install both packages |
| `npm run dev:backend` | Backend with reload |
| `npm run dev:frontend` | Frontend dev server |
| `npm run typecheck` | Typecheck both packages |
| `npm run test` | Backend test suite |
| `npm run build` | Build both packages |

## Environment variables

`backend/.env`

| Variable | Purpose |
|---|---|
| `PORT` | Listen port, default `4000` |
| `DATABASE_URL` | Supabase Postgres connection string |
| `CRON_SECRET` | Bearer token required by `/api/internal/*` |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |

`frontend/.env`

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend URL in production; empty uses the dev proxy |
| `VITE_BACKEND_ORIGIN` | Dev proxy target, default `http://localhost:4000` |

The backend refuses to start in production when `DATABASE_URL` or `CRON_SECRET` is missing.
`GET /health` reports which integrations are configured without ever echoing a credential.

## Live deployment

| Layer | URL |
|---|---|
| Dashboard (Vercel) | https://product-price-tracker-ochre.vercel.app |
| API (Render) | https://ppt-backend-lyiv.onrender.com |
| Database | Supabase PostgreSQL (pooler, `ap-northeast-2`) |
| Scheduler | cron-job.org, Custom `0 */2 * * *`, POST `/api/internal/scrape-all` with `Authorization: Bearer <CRON_SECRET>` |

## Scraping schedule

- External cron POSTs `/api/internal/scrape-all` every 2 hours (12 runs/day).
- No in-process loop anywhere: free-tier instances may sleep between invocations.
- Each invocation scrapes every active target once to completion (max 3 attempts,
  backoff+jitter between transient failures), then writes the run summary.
- Per-product frequency (bonus): each target carries `scrape_interval_hours`
  (default 2, range 1–168, editable on its card). Targets scraped more recently
  than their interval are skipped honestly (`skipped` count in the response).
- Manual triggers: `Scrape now` per card, `POST /api/tracked-products/:id/scrape`,
  and multi-option `POST /api/tracked-products/by-product`.

## Headed observable run

```bash
cd backend
npx playwright install chromium   # local only
npm run headed:scrape             # opens headed Chromium + runs real scraper verbosely
```

Full recording script: `backend/tools/HEADED_RECORDING.md`.

## Bonus features (all six)

| Bonus | Where |
|---|---|
| Price-drop / back-in-stock alerts (in-app badges + banner; SendGrid hook optional via `SENDGRID_API_KEY`/`ALERT_TO`) | `GET /api/alerts`, dashboard Alerts section |
| Multi-product overview + extra info (counts, avg price, brand/category in search, option axis in picker) | Dashboard Overview section |
| Change detection (structure-drift flags from terminal error codes) | `GET /api/change-events`, dashboard watch banner |
| Configurable scrape frequency per product (1–168h, scheduler respects it) | `scrape_interval_hours`, card control |
| Multi-option scrape in one run | `POST /api/tracked-products/by-product`, picker checkboxes |
| CI/CD | `.github/workflows/ci.yml` (backend typecheck+test+build, frontend typecheck+build) |

## Status

Production live: Render backend (`database:true`), Vercel dashboard, Supabase
schema (4 tables + 2 views) seeded with 3 tracked targets carrying real
scrapes; CSV export verified with honest retried rows. cron-job.org job fires
every 2 hours; headed recording + submission form close out delivery.
