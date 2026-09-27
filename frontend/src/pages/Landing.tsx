import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  fetchAlerts,
  fetchHistory,
  fetchRuns,
  listTracked,
  type AlertItem,
  type RunEntry,
  type TrackedTarget,
} from "../services/api";
import { ThemeToggle } from "../components/ui/theme-toggle";
import { TooltipGroup } from "../components/ui/tooltip-group";
import { OverflowTabs } from "../components/ui/overflow-tabs";
import { Countdown } from "../components/ui/countdown";
import { Odometer } from "../components/ui/odometer";
import { RelativeTime } from "../components/ui/relative-time";
import { formatRupees } from "../lib/format";
import { runCounts, runStatus } from "../lib/runStatus";
import { goHash, searchHref } from "../router";

/**
 * Story-led landing. One idea per viewport: the store is awkward, the log is
 * honest. Monochrome editorial type + single marker accent; motion explains
 * (parallax hero, scroll reveals, live proof ticker) and stops on request.
 * Hero right column shows REAL API data only — no invented stats.
 */
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.32, delay, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}

function ProofTicker({ targets }: { targets: TrackedTarget[] }) {
  if (targets.length === 0) return null;
  const items = [...targets, ...targets];
  return (
    <section
      className="relative z-0 flex overflow-hidden border-y border-border bg-card"
      aria-label="Live prices"
    >
      <div className="relative z-10 flex shrink-0 items-center gap-2 border-r border-border bg-card px-4 text-xs font-semibold tracking-[0.1em] text-foreground uppercase sm:px-5">
        <span aria-hidden className="size-1.5 rounded-full bg-foreground motion-safe:animate-pulse" />
        Live
      </div>
      <div className="ticker-track flex w-max items-center gap-10 px-5 py-3">
        {items.map((t, i) => (
          <span
            key={`${t.id}-${i}`}
            aria-hidden={i >= targets.length || undefined}
            className="flex items-center gap-2 text-sm tabular-nums"
          >
            <span className="font-semibold text-foreground">{t.productName}</span>
            <span className="text-muted">{t.selectedOption}</span>
            {t.latest ? (
              <span className="font-semibold text-foreground">{formatRupees(t.latest.price)}</span>
            ) : (
              <span className="text-muted">awaiting first scrape</span>
            )}
            <span aria-hidden className="text-muted">●</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function alertLabel(a: AlertItem): string {
  if (a.type === "price_drop") return `Price drop ${a.dropPct}%`;
  if (a.type === "back_in_stock") return "Back in stock";
  return "Scrape failed";
}

/** Hero right column: layered cards fed by the live API (empty => hidden). */
function HeroProof({ targets }: { targets: TrackedTarget[] }) {
  const [tab, setTab] = useState("live");
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  useEffect(() => {
    fetchRuns().then(setRuns).catch(() => {});
    fetchAlerts().then(setAlerts).catch(() => {});
  }, []);

  const t = targets[0];
  const lastRun = runs[0];
  // A run with no recorded attempt (queued, or dispatched with nothing due)
  // shows its state, not "0✓" — the same honesty rule the strip follows.
  const lastRunCounts = lastRun === undefined ? "" : runCounts(lastRun);
  const firstAlert = alerts[0];
  if (t === undefined) return null;

  return (
    <div className="relative mx-auto w-full max-w-md">
      <OverflowTabs
        label="Live proof"
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: "live",
            label: "Live price",
            content: (
              <div className="rounded-2xl border border-border bg-card p-5 shadow-raised">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-[0.1em] text-muted uppercase">
            Live price
          </p>
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-success">
            <span aria-hidden className="size-1.5 rounded-full bg-success motion-safe:animate-pulse" />
            validated
          </span>
        </div>
        <p className="mt-2 truncate text-[17px] font-semibold text-foreground">{t.productName}</p>
        <p className="font-data text-[13px] text-muted tabular-nums">
          {t.selectedOption} &middot; stock {t.latest ? t.latest.stock : "awaiting first scrape"}
        </p>
        {t.latest ? (
          <>
            {/* The number rolls, because a price that changes should look like
                it changed rather than blink to a new figure. */}
            <div className="mt-3 flex items-baseline gap-1.5">
              <span aria-hidden className="font-data text-xl text-muted">&#8377;</span>
              <Odometer
                value={t.latest.price}
                className="font-data text-4xl leading-none font-semibold text-foreground"
              />
            </div>
            <HeroSpark productId={t.id} />
          </>
        ) : (
          <p className="mt-3 text-2xl leading-tight font-semibold text-foreground">
            awaiting first scrape
          </p>
        )}
      </div>
            ),
          },
          {
            id: "next",
            label: "Next check",
            content: (
              <div className="rounded-2xl border border-dashed border-border bg-card p-4 shadow-raised">
                {/* The one number on the page that moves on its own, and it
                    moves for a real reason: the cron cadence is a real boundary. */}
                <Countdown />
              </div>
            ),
          },
          {
            id: "run",
            label: "Last run",
            content: (
              <div className="rounded-2xl border border-border bg-card p-4 shadow-raised">
        <p className="text-xs font-semibold tracking-[0.1em] text-muted uppercase">
          Last run
        </p>
        {lastRun ? (
          <div className="mt-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">
              <RelativeTime date={lastRun.startedAt} />
            </span>
            <span className="text-[13px] text-muted tabular-nums">
              {lastRun.triggerType} · {runStatus(lastRun.status).label}
              {lastRunCounts !== "" ? ` · ${lastRun.successCount}✓` : ""}
              {lastRun.failureCount > 0 ? ` ${lastRun.failureCount}✗` : ""}
            </span>
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-muted">no runs recorded yet</p>
        )}
      </div>
            ),
          },
        ]}
      />
      {firstAlert && (
        <p
          className={`mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium ${
            firstAlert.type === "price_drop" || firstAlert.type === "back_in_stock"
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {alertLabel(firstAlert)} · {firstAlert.productName}
        </p>
      )}
    </div>
  );
}

/**
 * The live price card's trend line. It DRAWS itself left to right, because
 * left-to-right is past-to-present: the direction of the stroke carries the
 * direction of time. The data is the real /history series — nothing is
 * interpolated, and a product with fewer than two observations shows no line
 * at all rather than an invented one.
 */
function HeroSpark({ productId }: { productId: string }) {
  const reduce = useReducedMotion();
  const [points, setPoints] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHistory(productId)
      .then((rows) => {
        if (cancelled) return;
        // Newest first from the API; the line reads oldest to newest.
        setPoints(rows.map((r) => r.price).reverse());
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (points === null || points.length < 2) return null;

  const W = 300;
  const H = 34;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = W / (points.length - 1);
  const d = points
    .map((v, i) => {
      const x = (i * step).toFixed(1);
      const y = (H - ((v - min) / span) * H).toFixed(1);
      return `${i ? "L" : "M"}${x} ${y}`;
    })
    .join(" ");
  const lastPoint = points[points.length - 1] ?? 0;
  const endY = H - ((lastPoint - min) / span) * H;
  const first = points[0] ?? 0;
  const delta = lastPoint - first;
  const dropped = delta < 0;

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[34px] w-full overflow-visible"
        role="img"
        aria-label={`Price trend across ${points.length} observations, from ${first} to ${lastPoint}`}
      >
        <motion.path
          d={d}
          fill="none"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-primary"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{
            duration: reduce ? 0 : 1.3,
            delay: reduce ? 0 : 0.35,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
        <motion.circle
          cx={W}
          cy={endY}
          r={2.75}
          className="fill-primary"
          initial={reduce ? false : { opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: reduce ? 0 : 0.4,
            delay: reduce ? 0 : 1.5,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{ transformOrigin: `${W}px ${endY}px` }}
        />
      </svg>
      <p className="mt-1 font-data text-[12px] text-muted tabular-nums">
        {points.length} observations
        {delta !== 0 && (
          <span className={dropped ? "text-success" : "text-muted"}>
            {" · "}
            <span aria-hidden>
              {dropped ? "▼" : "▲"}
            </span>{" "}
            <span className="sr-only">{dropped ? "down " : "up "}</span>
            {formatRupees(Math.abs(delta))}
          </span>
        )}
      </p>
    </div>
  );
}

const FEATURES = [
  {
    n: "01",
    title: "Reliable Scraping",
    body: "Handles dynamic content and site changes.",
  },
  {
    n: "02",
    title: "Full History",
    body: "See price and stock trends over time.",
  },
  {
    n: "03",
    title: "Transparent Logs",
    body: "Every scrape attempt is recorded.",
  },
];

export default function Landing() {
  const [targets, setTargets] = useState<TrackedTarget[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    listTracked().then(setTargets).catch(() => {});
  }, []);
  const hasProof = targets.length > 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    goHash(searchHref(query));
  }

  return (
    <div id="main" tabIndex={-1} className="app-texture min-h-screen bg-app text-foreground outline-hidden">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#/" className="flex items-center gap-2.5 outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary" aria-current="page">
            <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-foreground text-sm font-bold text-background">
              PT
            </span>
            <span className="text-[17px] font-semibold tracking-tight">PriceTracker</span>
          </a>
          <nav aria-label="Landing" className="flex items-center gap-1 text-sm sm:gap-2">
            <a href="#/search" className="hidden rounded-full px-3 py-1.5 text-muted hover:text-foreground sm:block">
              Products
            </a>
            <a href="#/docs" className="hidden rounded-full px-3 py-1.5 text-muted hover:text-foreground sm:block">
              About
            </a>
            <TooltipGroup>
              <ThemeToggle />
            </TooltipGroup>
            <a
              href="#/app"
              className="ml-1 inline-flex min-h-10 items-center rounded-xl bg-foreground px-4 font-semibold text-background hover:opacity-90"
            >
              Get Started
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-3xl px-4 pt-16 pb-12 text-center sm:px-6 sm:pt-24">
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
            Track Product Prices Over Time
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted sm:text-lg">
            Get notified when prices drop. Reliable, automated, and transparent.
          </p>
          <form role="search" onSubmit={submit} className="mx-auto mt-8 flex max-w-xl gap-2">
            <label htmlFor="landing-search" className="sr-only">
              Search products
            </label>
            <input
              id="landing-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for a product (e.g., laptop, headphones)…"
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-border bg-card px-4 text-[15px] outline-hidden placeholder:text-muted/80 focus:border-primary"
            />
            <button
              type="submit"
              aria-label="Search products"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-foreground text-lg font-bold text-background hover:opacity-90"
            >
              <span aria-hidden>→</span>
            </button>
          </form>
          {hasProof && (
            <div className="mx-auto mt-10 max-w-xl text-left">
              <HeroProof targets={targets} />
            </div>
          )}
        </section>

        <ProofTicker targets={targets} />

        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16" aria-label="Why PriceTracker">
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <Reveal key={feature.n} delay={index * 0.06}>
                <div className="h-full rounded-2xl border border-border bg-card p-6 text-left shadow-raised">
                  <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-surface text-foreground">
                    {index === 0 ? (
                      <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
                        <circle cx="10" cy="10" r="2.6" />
                        <path d="M10 2.8v2.3M10 14.9v2.3M2.8 10h2.3M14.9 10h2.3M4.9 4.9l1.6 1.6M13.5 13.5l1.6 1.6M15.1 4.9l-1.6 1.6M6.5 13.5l-1.6 1.6" />
                      </svg>
                    ) : index === 1 ? (
                      <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3 16.5 7.5 12l3 2.5L17 8" />
                        <path d="M13.5 8H17v3.5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
                        <path d="M5 5.5h10M5 10h10M5 14.5h6" />
                      </svg>
                    )}
                  </span>
                  <h2 className="mt-4 text-lg font-semibold tracking-tight">{feature.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{feature.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
          <Reveal>
            <div className="rounded-2xl bg-foreground px-6 py-12 text-center text-background sm:px-12">
              <h2 className="mx-auto max-w-xl text-2xl font-semibold tracking-tight text-balance sm:text-4xl">
                Start with one product. Keep every check.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm opacity-90 sm:text-base">
                Search the mock store, track the exact option, and export the full attempt history.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a
                  href="#/search"
                  className="inline-flex min-h-11 items-center rounded-xl bg-background px-6 text-sm font-semibold text-foreground hover:opacity-90"
                >
                  Search Products
                </a>
                <a
                  href="#/app"
                  className="inline-flex min-h-11 items-center rounded-xl border border-background/30 px-6 text-sm font-semibold hover:bg-background/10"
                >
                  Open Dashboard
                </a>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-[13px] text-muted sm:px-6">
          <p>React · Express · Supabase · cron-job.org · Built by iAMv1</p>
          <p className="flex gap-4">
            <a href="#/docs" className="rounded-full py-1.5 hover:text-foreground">Docs</a>
            <a href="#/changelog" className="rounded-full py-1.5 hover:text-foreground">Changelog</a>
            <a href="https://demo.inelabteamdev.com" target="_blank" rel="noreferrer" className="rounded-full py-1.5 hover:text-foreground">Mock store</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
