import { SiteNav } from "../components/site-nav";

/** Product docs: setup, schedule, env, API, tracking, headed run. Only the scheduler route is Bearer-authenticated; public demo writes are open by design — no user sessions. */
const SECTIONS: Array<{ id: string; title: string; body: string[]; code?: string }> = [
  {
    id: "setup",
    title: "Local setup",
    body: [
      "Requires Node 22.13+. Install both packages, copy the env examples, run backend and frontend in separate terminals.",
    ],
    code: "npm run install:all\ncp backend/.env.example backend/.env\ncp frontend/.env.example frontend/.env\nnpm run dev:backend   # :4000\nnpm run dev:frontend  # :5173",
  },
  {
    id: "schedule",
    title: "Scraping schedule",
    body: [
      "External cron (cron-job.org) POSTs /api/internal/scrape-all every 2 hours — Custom 0 */2 * * * — with Authorization: Bearer <CRON_SECRET>. No in-process loop exists; free-tier instances may sleep between invocations. Each target carries scrape_interval_hours (default 2, range 1–168); recently-scraped targets are skipped honestly.",
      "The trigger is layered so it can never silently stop: Supabase pg_cron pings GET /health every 10 minutes (2-59/10 * * * *) to keep the free Render instance awake, and a second pg_cron job re-fires scrape-all at :50 past every even UTC hour (50 */2 * * *). If the primary cron dies entirely, the rescue still lands inside the same 2-hour window; the due-check turns any overlap into an honest skipped no-op instead of double work. A GitHub Actions workflow pings /health every 5 minutes as a redundant third layer.",
    ],
  },
  {
    id: "env",
    title: "Environment variables",
    body: [
      "Backend: PORT, STORE_URL, DATABASE_URL (Supabase pooler), CRON_SECRET, CORS_ORIGINS. Frontend: VITE_API_BASE_URL (Render URL in production), VITE_BACKEND_ORIGIN (dev proxy).",
    ],
  },
  {
    id: "api",
    title: "API",
    body: [
      "Public reads: GET /health, /api/products/search?q=, /api/products/:id, /api/tracked-products (+/:id/history, /:id/scrape-log), /api/alerts, /api/change-events (failure-based structural drift flags), /api/export.csv. Open writes (public demo — no user accounts by design): POST/PATCH/DELETE /api/tracked-products, POST /:id/scrape, POST /by-product. Untrack is a soft delete — attempts and history stay — and seeded demo targets are protected from public removal (403 demo_protected, server message shown in the UI).",
      "Scheduler entry now dispatches: POST /api/internal/scrape-all (Bearer CRON_SECRET, rate-limited 30 / 15 min) recovers stale runs, takes a single-flight lease, persists the due run, replies 202, then executes with heartbeats — ?wait=true for synchronous mode; overlapping invocations no-op honestly while the lease is held. Health: GET /health stays 200 while serving, and its body distinguishes configured vs reachable (SELECT 1, 2s budget).",
    ],
  },
  {
    id: "tracking",
    title: "Tracking",
    body: [
      "Search by partial or full product name, pick the exact option, and track it — the first scrape runs immediately so the card never waits for the cron tick. Each card carries its own scrape cadence (default 2h, range 1–168h); the scheduler skips recently-scraped targets and reports them as skipped. Multiple options of one product track together via the checkboxes and the one-run button.",
    ],
  },
  {
    id: "headed",
    title: "Headed run",
    body: ["Local only (Render skips the browser download). Full script in backend/tools/HEADED_RECORDING.md."],
    code: "cd backend\nnpx playwright install chromium\nnpm run headed:scrape",
  },
];

export default function Docs() {
  return (
    <>
      <SiteNav variant="app" />
      <div id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-8 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground sm:px-6">
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">Docs</h1>
      <p className="mt-3 text-muted">Everything needed to run and schedule the tracker — including its one Bearer-authenticated route. Public demo writes stay open; there are no user sessions.</p>
      <div className="mt-10 grid gap-10">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id}>
            <h2 className="text-xl font-semibold">{s.title}</h2>
            {s.body.map((p) => (
              <p key={p.slice(0, 24)} className="mt-2 text-[15px] leading-relaxed text-muted">{p}</p>
            ))}
            {s.code && (
              <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface p-4 font-mono text-[13px] leading-relaxed">
                {s.code}
              </pre>
            )}
          </section>
        ))}
      </div>
      </div>
    </>
  );
}
