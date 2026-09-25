import { ThemeToggle } from "../components/ui/theme-toggle";

const ENTRIES: Array<{ v: string; date: string; items: string[] }> = [
  {
    v: "v0.3 — Story & navigation",
    date: "2026-09-25",
    items: [
      "Story-led landing with live proof ticker, scroll chapters, method bento.",
      "Hash-routed docs and changelog pages; dashboard deep-linkable at #/app.",
      "Auth experiment reverted: the dashboard stays open, no login wall.",
    ],
  },
  {
    v: "v0.2 — All six bonuses",
    date: "2026-09-25",
    items: [
      "Price-drop / back-in-stock alerts, multi-product overview, change detection.",
      "Per-product scrape frequency, multi-option one-run tracking, CI workflow.",
      "Headed observable runner with recording guide.",
    ],
  },
  {
    v: "v0.1 — Hardened launch",
    date: "2026-09-25",
    items: [
      "Rate limiting, helmet, CSV injection guard, shared guards, UUID validation.",
      "Supabase pooler fix for IPv6-only host; 3 targets seeded with real scrapes.",
    ],
  },
];

export default function Changelog() {
  return (
    <div id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-8 outline-none sm:px-6">
      <header className="flex items-center justify-between">
        <a href="#/" className="text-[15px] font-semibold tracking-tight">Price Tracker</a>
        <div className="flex items-center gap-1 text-sm">
          <a href="#/app" className="rounded-full px-3 py-1.5 hover:bg-foreground/10">Dashboard</a>
          <ThemeToggle />
        </div>
      </header>
      <h1 className="mt-10 text-4xl font-semibold tracking-tight sm:text-5xl">Changelog</h1>
      <div className="mt-10 grid gap-4">
        {ENTRIES.map((e) => (
          <article key={e.v} className="rounded-2xl border border-border bg-surface p-6 shadow-raised">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{e.v}</h2>
              <p className="font-mono text-[13px] text-muted tabular-nums">{e.date}</p>
            </div>
            <ul className="mt-3 grid gap-1.5 text-sm text-muted">
              {e.items.map((i) => (
                <li key={i.slice(0, 32)} className="flex gap-2">
                  <span aria-hidden className="text-marker">—</span>
                  {i}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
