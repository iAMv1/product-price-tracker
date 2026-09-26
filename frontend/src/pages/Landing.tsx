import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import {
  fetchAlerts,
  fetchRuns,
  listTracked,
  type AlertItem,
  type RunEntry,
  type TrackedTarget,
} from "../services/api";
import { SiteNav } from "../components/site-nav";
import { RelativeTime } from "../components/ui/relative-time";
import { cn } from "../lib/cn";
import { formatRupees } from "../lib/format";

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
      className="relative z-0 flex overflow-hidden border-y border-border bg-surface"
      aria-label="Live prices"
    >
      <div className="relative z-10 flex shrink-0 items-center gap-2 border-r border-border bg-surface px-4 text-[12px] font-semibold tracking-[0.18em] text-marker uppercase sm:px-5">
        <span aria-hidden className="size-1.5 rounded-full bg-marker motion-safe:animate-pulse" />
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
            <span aria-hidden className="text-marker">●</span>
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
  const reduce = useReducedMotion();
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  useEffect(() => {
    fetchRuns().then(setRuns).catch(() => {});
    fetchAlerts().then(setAlerts).catch(() => {});
  }, []);

  const t = targets[0];
  const lastRun = runs[0];
  const firstAlert = alerts[0];
  if (t === undefined) return null;
  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] as const },
        };

  return (
    <div className="relative mx-auto w-full max-w-md">
      <motion.div
        {...rise(0.15)}
        className="rotate-[-0.8deg] rounded-2xl border border-border bg-surface p-5 shadow-raised"
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
            Live price
          </p>
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-marker">
            <span aria-hidden className="size-1.5 rounded-full bg-marker motion-safe:animate-pulse" />
            validated
          </span>
        </div>
        <p className="mt-2 truncate text-[15px] font-semibold text-foreground">{t.productName}</p>
        <p className="text-[13px] text-muted tabular-nums">
          {t.selectedOption} · stock {t.latest ? t.latest.stock : "—"}
        </p>
        <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground tabular-nums">
          {t.latest ? formatRupees(t.latest.price) : "awaiting first scrape"}
        </p>
      </motion.div>

      <motion.div
        {...rise(0.3)}
        className="mt-4 ml-6 rotate-[0.6deg] rounded-2xl border border-border bg-background p-4 shadow-raised sm:ml-12"
      >
        <p className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
          Last run
        </p>
        {lastRun ? (
          <div className="mt-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">
              <RelativeTime date={lastRun.startedAt} />
            </span>
            <span className="text-[13px] text-muted tabular-nums">
              {lastRun.triggerType} · {lastRun.successCount}✓
              {lastRun.failureCount > 0 ? ` ${lastRun.failureCount}✗` : ""}
            </span>
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-muted">no runs recorded yet</p>
        )}
      </motion.div>

      {firstAlert && (
        <motion.div
          {...rise(0.45)}
          className="mt-4 -ml-1 inline-flex items-center gap-2 rounded-full border border-danger/30 bg-danger/10 px-4 py-2 text-[13px] font-medium text-danger"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-danger" />
          {alertLabel(firstAlert)} · {firstAlert.productName}
        </motion.div>
      )}
    </div>
  );
}

const CHAPTERS = [
  {
    n: "01",
    title: "The store is deliberately awkward",
    body: "Prices arrive late, responses stall, and the occasional 5xx lands mid-run. A naive scraper reads a half-loaded page and stores a lie.",
  },
  {
    n: "02",
    title: "So the scraper shakes hands instead",
    body: "Catalog, item, quote: the same handshake the storefront itself uses. Exact option IDs, validated identity, validated price and stock — or no observation at all.",
  },
  {
    n: "03",
    title: "Failures stay visible",
    body: "Slow loads retry with backoff. Terminal failures log honestly with empty price and stock. The latest known-good value is never overwritten by a failure.",
  },
  {
    n: "04",
    title: "Proof, every two hours",
    body: "An external cron wakes the backend on schedule. Every attempt lands in the scrape log and the CSV — including the retried ones.",
  },
];

const METHOD = [
  {
    t: "Validated observations only",
    d: "Price and stock land in history together, atomically — or not at all.",
    span: "sm:col-span-2",
  },
  { t: "Every attempt logged", d: "Success, retried, failed. Attempt number, timestamp, error code.", span: "" },
  { t: "CSV that reconciles", d: "One row per attempt, exact column order, failures included with empty values.", span: "" },
  {
    t: "Headed and watchable",
    d: "Run the scraper in a visible browser and watch it handle slow responses.",
    span: "sm:col-span-2",
  },
];

export default function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [targets, setTargets] = useState<TrackedTarget[]>([]);
  useEffect(() => {
    listTracked().then(setTargets).catch(() => {});
  }, []);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0]);
  const hasProof = targets.length > 0;

  return (
    <div id="main" tabIndex={-1} className="focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground">
      <SiteNav variant="landing" />

      <div ref={heroRef} className="relative overflow-hidden">
        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className={cn(
            "mx-auto grid w-full max-w-6xl gap-10 px-4 pt-20 pb-14 sm:px-6 sm:pt-32 sm:pb-20",
            hasProof && "lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-12",
          )}
        >
          <div>
            <p className="text-[13px] font-medium tracking-[0.2em] text-marker uppercase">
              INE mock store · scraped every 2 hours
            </p>
            <h1 className="mt-4 text-5xl leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
              The store lies. The log doesn&rsquo;t.
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">
              A price tracker that survives an awkward storefront: late prices, slow
              responses, failing requests — recorded honestly, never papered over.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#/app"
                className="flex h-11 items-center rounded-full bg-foreground px-6 font-medium text-background hover:opacity-90"
              >
                See live proof
              </a>
              <a
                href="#/docs"
                className="flex h-11 items-center rounded-full border border-border px-6 font-medium hover:bg-foreground/10"
              >
                How it works
              </a>
            </div>
          </div>
          {hasProof && <HeroProof targets={targets} />}
        </motion.div>
      </div>

      <ProofTicker targets={targets} />

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {CHAPTERS.map((c) => (
          <section
            key={c.n}
            className="grid gap-3 border-b border-border py-12 sm:grid-cols-[72px_1.05fr_1fr] sm:gap-6 sm:py-16"
          >
            <Reveal>
              <p className="font-mono text-sm text-marker tabular-nums">{c.n}</p>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="max-w-md text-[28px] leading-[1.1] font-semibold tracking-tight text-balance sm:text-[34px]">
                {c.title}
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="max-w-md text-[15px] leading-relaxed text-muted">{c.body}</p>
            </Reveal>
          </section>
        ))}

        <section className="py-16 sm:py-20">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              The instrument panel
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {METHOD.map((f, i) => (
              <Reveal key={f.t} delay={i * 0.06} className={f.span}>
                <div className="h-full rounded-2xl border border-border bg-surface p-6 shadow-raised">
                  <p className="font-mono text-[13px] text-marker">0{i + 1}</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight">{f.t}</h3>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="pb-24">
          <Reveal>
            <div className="rounded-2xl bg-foreground px-6 py-14 text-center text-background sm:px-12 sm:py-16">
              <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
                Three products. Live prices. Honest failures.
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a
                  href="#/app"
                  className="flex h-11 items-center rounded-full bg-background px-6 font-medium text-foreground"
                >
                  Open the dashboard
                </a>
                <a
                  href="#/docs"
                  className="flex h-11 items-center rounded-full border border-background/30 px-6 font-medium"
                >
                  Read the docs
                </a>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-[13px] text-muted sm:px-6">
          <p>React · Express · Supabase · cron-job.org</p>
          <p className="flex gap-4">
            <a href="#/docs" className="hover:text-foreground">Docs</a>
            <a href="#/changelog" className="hover:text-foreground">Changelog</a>
            <a href="https://demo.inelabteamdev.com" target="_blank" rel="noreferrer" className="hover:text-foreground">Mock store</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
