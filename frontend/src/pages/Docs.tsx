import { ThemeToggle } from "../components/ui/theme-toggle";

/** Product docs: setup, schedule, env, API, auth/Google setup. */
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
    ],
  },
  {
    id: "env",
    title: "Environment variables",
    body: [
      "Backend: PORT, STORE_URL, DATABASE_URL (Supabase pooler), CRON_SECRET, CORS_ORIGINS, SUPABASE_URL + SUPABASE_ANON_KEY (user auth; unset = open dev mode). Frontend: VITE_API_BASE_URL (Render URL in production), VITE_BACKEND_ORIGIN (dev proxy), VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (login UI).",
    ],
  },
  {
    id: "api",
    title: "API",
    body: [
      "Public reads: GET /health, /api/products/search?q=, /api/products/:id, /api/tracked-products (+/:id/history, /:id/scrape-log), /api/alerts, /api/change-events, /api/export.csv. Authed writes (Bearer session): POST/PATCH/DELETE /api/tracked-products, POST /:id/scrape, POST /by-product. Scheduler: POST /api/internal/scrape-all (Bearer CRON_SECRET).",
    ],
  },
  {
    id: "auth",
    title: "Auth + Google setup",
    body: [
      "1) Supabase dashboard → Authentication → Providers → enable Email and Google. 2) Google Cloud Console → OAuth client (web) → authorized redirect URI from the Supabase Google provider page → paste client ID + secret into Supabase. 3) Supabase → Authentication → URL Configuration → add https://product-price-tracker-ochre.vercel.app. 4) Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY on Vercel and SUPABASE_URL + SUPABASE_ANON_KEY on Render, redeploy both.",
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
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between">
        <a href="#/" className="text-[15px] font-semibold tracking-tight">Price Tracker</a>
        <div className="flex items-center gap-1 text-sm">
          <a href="#/app" className="rounded-full px-3 py-1.5 hover:bg-foreground/10">Dashboard</a>
          <ThemeToggle />
        </div>
      </header>
      <h1 className="mt-10 text-4xl font-semibold tracking-tight sm:text-5xl">Docs</h1>
      <p className="mt-3 text-muted">Everything needed to run, schedule, and authenticate the tracker.</p>
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
  );
}
