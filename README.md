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
├── .github/workflows/
│   ├── ci.yml                    CI: typecheck + tests + build (both packages)
│   └── keep-alive.yml            5-min /health ping — keeps free tier awake
├── backend/          API + scrape orchestrator + scraper engine (Node/Express/TS)
├── frontend/         React dashboard (Vite)
├── db/               migrations and schema
├── render.yaml       Render deploy config
├── DESIGN_NOTE.md    reliability, trade-offs, AI usage disclosure
└── README.md         this file
```

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
| `SENDGRID_API_KEY` | optional — enables email alerts (in-app alerts work without it) |
| `ALERT_TO` | optional — alert recipient address |

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
- Keep-alive: `.github/workflows/keep-alive.yml` pings `GET /health` every
  5 minutes so the instance is awake when the 2h cron fires. (A cold instance
  makes Render's load balancer answer with an HTML error page that
  cron-job.org rejects as "output too large" — the scheduled scrape would
  never reach the backend. The assignment says: "keep the instance warm if
  needed.") Scraping itself stays cron-job.org-only.
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

## Third-party code

UI components adapted from [xevrion/ui-lab](https://lab.xevrion.dev/)
(**MIT License**): toast stack, dropdown menu, segmented control, tooltip
group, theme toggle, expanding search, odometer, sparkline, relative time,
scroll reveal. Every adapted file carries its source path in a header comment;
all project code around them is original. `motion` and other MIT npm
dependencies are listed in the lockfiles. See `DESIGN_NOTE.md` for the full
AI-usage disclosure required by the assignment guidelines.

## Status

Production live: Render backend (`database:true`), Vercel dashboard, Supabase
schema (4 tables + 2 views) seeded with 3 tracked targets carrying real
scrapes; CSV export verified with honest retried rows. cron-job.org job fires
every 2 hours; headed recording + submission form close out delivery.
