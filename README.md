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

## Status

Phase 0 of `project/IMPLEMENTATION_PLAN.md` is complete: both applications build, typecheck,
start, and the frontend reaches the backend. Evidence is in `knowledge/VERIFICATION_LOG.md`.

Phase 1 — storefront discovery — is in progress. Findings so far, recorded in
`knowledge/OBSERVATIONS.md`, show the mock store is a **client-rendered SPA with no
server-rendered product markup**, which means plain HTTP + HTML parsing cannot read price or
stock from this storefront. The strategy decision is deliberately still open until the SPA's
data source is identified.
