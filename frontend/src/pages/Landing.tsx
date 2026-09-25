import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { listTracked, type TrackedTarget } from "../services/api";
import { ThemeToggle } from "../components/ui/theme-toggle";
import { useAuth } from "../auth/AuthContext";

/**
 * Story-led landing. One idea per viewport: the store is awkward, the log is
 * honest. Monochrome editorial type + single marker accent; motion explains
 * (parallax hero, scroll reveals, live proof ticker) and stops on request.
 */
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.32, delay, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}

function ProofTicker() {
  const [targets, setTargets] = useState<TrackedTarget[]>([]);
  useEffect(() => {
    listTracked().then(setTargets).catch(() => {});
  }, []);
  if (targets.length === 0) return null;
  const items = [...targets, ...targets];
  return (
    <div className="overflow-hidden border-y border-border bg-surface" aria-label="Live prices">
      <div className="ticker-track flex w-max items-center gap-10 px-5 py-3">
        {items.map((t, i) => (
          <span key={`${t.id}-${i}`} className="flex items-center gap-2 text-[13px] tabular-nums">
            <span className="font-semibold text-foreground">{t.productName}</span>
            <span className="text-muted">{t.selectedOption}</span>
            {t.latest ? (
              <span className="font-medium text-foreground">₹{t.latest.price}</span>
            ) : (
              <span className="text-muted">awaiting first scrape</span>
            )}
            <span aria-hidden className="text-marker">●</span>
          </span>
        ))}
      </div>
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

export default function Landing() {
  const { user } = useAuth();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0]);

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#/" className="text-[15px] font-semibold tracking-tight">
            Price Tracker
          </a>
          <nav className="flex items-center gap-1 text-sm sm:gap-2">
            <a href="#/app" className="rounded-full px-3 py-1.5 hover:bg-foreground/10">Dashboard</a>
            <a href="#/docs" className="hidden rounded-full px-3 py-1.5 hover:bg-foreground/10 sm:inline">Docs</a>
            <a href="#/changelog" className="hidden rounded-full px-3 py-1.5 hover:bg-foreground/10 sm:inline">Changelog</a>
            {user ? (
              <a href="#/app" className="rounded-full bg-foreground px-4 py-1.5 font-medium text-background">Open app</a>
            ) : (
              <a href="#/login" className="rounded-full bg-foreground px-4 py-1.5 font-medium text-background">Sign in</a>
            )}
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <div ref={heroRef} className="relative overflow-hidden">
        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="mx-auto w-full max-w-6xl px-4 pt-24 pb-16 sm:px-6 sm:pt-36 sm:pb-24">
          <p className="text-[13px] font-medium tracking-[0.2em] text-marker uppercase">
            INE mock store · scraped every 2 hours
          </p>
          <h1 className="mt-4 max-w-4xl text-5xl leading-[1.02] font-semibold tracking-tight text-balance sm:text-7xl">
            The store lies. The log doesn&rsquo;t.
          </h1>
          <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">
            A price tracker that survives an awkward storefront: late prices, slow
            responses, failing requests — recorded honestly, never papered over.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#/app"
              className="h-11 rounded-full bg-foreground px-6 leading-11 font-medium text-background hover:opacity-90"
            >
              See live proof
            </a>
            <a
              href="#/docs"
              className="h-11 rounded-full border border-border px-6 leading-11 font-medium hover:bg-foreground/10"
            >
              How it works
            </a>
          </div>
        </motion.div>
      </div>

      <ProofTicker />

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {CHAPTERS.map((c) => (
          <section key={c.n} className="grid gap-2 border-b border-border py-16 sm:grid-cols-[96px_1fr_1fr] sm:py-24">
            <Reveal>
              <p className="font-mono text-sm text-marker tabular-nums">{c.n}</p>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="max-w-md text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                {c.title}
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="max-w-md text-[15px] leading-relaxed text-muted">{c.body}</p>
            </Reveal>
          </section>
        ))}

        <section className="py-16 sm:py-24">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">The instrument panel</h2>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { t: "Validated observations only", d: "Price and stock land in history together, atomically — or not at all.", span: "sm:col-span-2" },
              { t: "Every attempt logged", d: "Success, retried, failed. Attempt number, timestamp, error code.", span: "" },
              { t: "CSV that reconciles", d: "One row per attempt, exact column order, failures included with empty values.", span: "" },
              { t: "Headed and watchable", d: "Run the scraper in a visible browser and watch it handle slow responses.", span: "sm:col-span-2" },
            ].map((f, i) => (
              <Reveal key={f.t} delay={i * 0.06}>
                <div className={`rounded-2xl border border-border bg-surface p-6 shadow-raised ${f.span}`}>
                  <p className="font-mono text-[13px] text-marker">0{i + 1}</p>
                  <h3 className="mt-2 text-lg font-semibold">{f.t}</h3>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="pb-24">
          <Reveal>
            <div className="rounded-2xl bg-foreground p-8 text-background sm:p-12">
              <h2 className="max-w-lg text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Three products. Live prices. Honest failures.
              </h2>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="#/app" className="h-11 rounded-full bg-background px-6 leading-11 font-medium text-foreground">
                  Open the dashboard
                </a>
                {!user && (
                  <a href="#/login" className="h-11 rounded-full border border-background/30 px-6 leading-11 font-medium">
                    Sign in to track
                  </a>
                )}
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
