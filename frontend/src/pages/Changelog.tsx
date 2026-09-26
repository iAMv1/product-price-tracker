import { SiteNav } from "../components/site-nav";

const ENTRIES: Array<{ v: string; date: string; items: string[] }> = [
  {
    v: "v0.5 — Control plane & evidence integrity",
    date: "2026-09-26",
    items: [
      "Scheduler dispatches: durable run claim, 202 fast reply, single-flight lease, heartbeats with stale-run recovery (abandoned, never stuck running).",
      "Evidence integrity: composite history provenance, deterministic latest view, temporal indexes, soft untrack that preserves attempts and history.",
      "Seeded demo targets reject public removal (403 demo_protected); server messages now reach the UI error paths.",
      "Retry policy unified at 1s/2s/4s; recording drives the real runner through a tools-only fault seam (attempt 1: 503 → retried → success).",
      "Health reports configured vs reachable (SELECT 1); search caches listing pages; PoW time budget; parser rejects impossible numerics.",
      "All five run states render deliberately; docs describe dispatch, soft delete, and the one Bearer-authenticated route accurately.",
    ],
  },
  {
    v: "v0.4 — Review hardening",
    date: "2026-09-26",
    items: [
      "Search became a real combobox: listbox semantics, cancel, elapsed feedback.",
      "Accessibility pass: skip link, aria-current, alerts, 24px targets, shared nav.",
      "Layered scheduler: pg_cron keep-alive + rescue so the 2h trigger never dies.",
      "Per-IP limits with trust proxy, 437 kB entry, honest price labels everywhere.",
    ],
  },
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
      "Price-drop / back-in-stock alerts, multi-product overview, change detection (failure-based structural drift from terminal error codes).",
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
    <>
      <SiteNav variant="app" />
      <div id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-8 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground sm:px-6">
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">Changelog</h1>
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
    </>
  );
}
