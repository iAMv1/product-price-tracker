import { useCallback, useEffect, useState } from "react";
import { SectionTitle, SiteNav } from "../components/site-nav";
import { Odometer } from "../components/ui/odometer";
import { RelativeTime } from "../components/ui/relative-time";
import { Sparkline } from "../components/ui/sparkline";
import { StatusPill } from "../components/ui/status-pill";
import { formatRupees, nextScrapeIn } from "../lib/format";
import { useRoute } from "../router";
import {
  fetchAlerts,
  fetchHistory,
  fetchScrapeLog,
  listTracked,
  updateInterval,
  type AlertItem,
  type AttemptEntry,
  type HistoryEntry,
  type TrackedTarget,
} from "../services/api";

type ViewState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ready"; target: TrackedTarget; history: HistoryEntry[]; log: AttemptEntry[]; alerts: AlertItem[] };

function shortLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function fullTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function alertLabel(a: AlertItem): string {
  if (a.type === "price_drop") return `Price drop ${a.dropPct}% — now ${formatRupees(a.toPrice ?? 0)}`;
  if (a.type === "back_in_stock") return `Back in stock (${a.stock ?? "in stock"})`;
  return `Scrape failed${a.errorCode ? ` — ${a.errorCode}` : ""}`;
}

/** Quick view: one product, full depth — price, trend, history, log, schedule. */
export default function Product() {
  const [, , id] = useRoute();
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [detailError, setDetailError] = useState<string | null>(null);
  const [intervalHours, setIntervalHours] = useState(2);
  const [savingInterval, setSavingInterval] = useState(false);

  const load = useCallback(async (targetId: string | null) => {
    if (!targetId) {
      setState({ kind: "missing" });
      return;
    }
    setState({ kind: "loading" });
    setDetailError(null);
    try {
      const targets = await listTracked();
      const target = targets.find((t) => t.id === targetId);
      if (!target) {
        setState({ kind: "missing" });
        return;
      }
      const [history, log, allAlerts] = await Promise.all([
        fetchHistory(targetId),
        fetchScrapeLog(targetId),
        fetchAlerts(),
      ]);
      setState({
        kind: "ready",
        target,
        history,
        log,
        alerts: allAlerts.filter((a) => a.trackedProductId === targetId),
      });
      setIntervalHours(target.scrapeIntervalHours ?? 2);
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Unknown error" });
    }
  }, []);

  useEffect(() => {
    void load(id);
  }, [id, load]);

  async function saveInterval() {
    if (state.kind !== "ready") return;
    const hours = Math.min(168, Math.max(1, Math.round(Number(intervalHours) || 2)));
    setSavingInterval(true);
    setDetailError(null);
    try {
      await updateInterval(state.target.id, hours);
      setIntervalHours(hours);
      await load(state.target.id);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSavingInterval(false);
    }
  }

  return (
    <>
      <SiteNav variant="app" />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-4xl px-4 py-8 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground sm:px-6"
      >
        <a
          href="#/app"
          className="inline-flex items-center gap-1.5 rounded-full text-sm text-muted outline-hidden hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
        >
          <span aria-hidden>←</span> Back to dashboard
        </a>

        {state.kind === "loading" && (
          <div role="status" className="mt-8 grid gap-4">
            <div className="h-7 w-2/3 rounded bg-foreground/10 motion-safe:animate-pulse" />
            <div className="h-24 rounded-2xl bg-foreground/10 motion-safe:animate-pulse" />
            <div className="h-40 rounded-2xl bg-foreground/10 motion-safe:animate-pulse" />
            <p className="sr-only">Loading target…</p>
          </div>
        )}

        {state.kind === "missing" && (
          <div className="mt-10 rounded-2xl border border-border bg-surface p-6 text-center shadow-raised">
            <h1 className="text-lg font-semibold text-foreground">Target not found</h1>
            <p className="mt-1 text-sm text-muted">
              This quick view id is not tracked anymore — it may have been untracked.
            </p>
            <a
              href="#/app"
              className="mt-4 inline-flex h-10 items-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background"
            >
              Back to dashboard
            </a>
          </div>
        )}

        {state.kind === "error" && (
          <div role="alert" className="mt-8 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            <p>Could not load this target: {state.message}</p>
            <button
              type="button"
              onClick={() => void load(id)}
              className="mt-2 h-10 rounded-full border border-danger/40 px-4 text-[13px] font-medium hover:bg-danger/10"
            >
              Retry
            </button>
          </div>
        )}

        {state.kind === "ready" &&
          (() => {
            const { target, history, log, alerts } = state;
            const failed = target.lastScrape?.outcome === "failed";
            const points = history
              .slice()
              .reverse()
              .map((h) => ({ label: shortLabel(h.observed_at), value: h.price }));

            return (
              <>
                <header className="mt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        {target.productName}
                      </h1>
                      <p className="mt-1 text-sm text-muted tabular-nums">
                        {target.storeProductId} · {target.selectedOption} ·{" "}
                        <a
                          href={target.productUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-foreground/30 underline-offset-2 outline-hidden hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
                        >
                          store page
                        </a>
                      </p>
                    </div>
                    {target.lastScrape && <StatusPill outcome={target.lastScrape.outcome} />}
                  </div>
                </header>

                {alerts.length > 0 && (
                  <section
                    aria-label="Alerts"
                    className="mt-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3.5"
                  >
                    <h2 className="text-[13px] font-semibold text-amber-700 dark:text-amber-400">
                      Alerts ({alerts.length})
                    </h2>
                    <ul className="mt-1.5 grid gap-1.5 text-[13px]">
                      {alerts.slice(0, 5).map((a, i) => (
                        <li key={`${a.type}-${i}`} className="text-foreground">
                          {alertLabel(a)}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Price hero */}
                <section aria-label="Current price" className="mt-6">
                  <p className="text-[13px] text-muted">Current price</p>
                  {target.latest ? (
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span aria-hidden className="text-2xl font-medium text-muted">
                        ₹
                      </span>
                      <Odometer
                        value={target.latest.price}
                        className="text-[44px] leading-none font-semibold tracking-tight text-foreground"
                      />
                      <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[13px] font-medium text-foreground tabular-nums">
                        {target.latest.stock}
                      </span>
                      <span className="text-sm text-muted">
                        observed <RelativeTime date={target.latest.observedAt} />
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-muted">no validated observation yet</p>
                  )}
                  {failed && (
                    <p role="alert" className="mt-3 max-w-xl rounded-xl bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
                      Latest scrape failed. Showing the last validated observation, not fresh data.
                    </p>
                  )}
                </section>

                {/* Flat fact band — no nested tiles */}
                <dl className="mt-6 grid grid-cols-2 gap-y-4 border-y border-border bg-surface px-5 py-4 sm:grid-cols-4">
                  <div>
                    <dt className="text-[12px] tracking-wide text-muted uppercase">Last success</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground">
                      {target.lastScrape ? <RelativeTime date={target.lastScrape.attemptedAt} /> : "never"}
                    </dd>
                  </div>
                  <div className="sm:border-l sm:border-border sm:pl-5">
                    <dt className="text-[12px] tracking-wide text-muted uppercase">Next scrape</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                      {nextScrapeIn(target.lastScrape?.attemptedAt, target.scrapeIntervalHours)}
                    </dd>
                  </div>
                  <div className="sm:border-l sm:border-border sm:pl-5">
                    <dt className="text-[12px] tracking-wide text-muted uppercase">Interval</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                      every {target.scrapeIntervalHours ?? 2} h
                    </dd>
                  </div>
                  <div className="sm:border-l sm:border-border sm:pl-5">
                    <dt className="text-[12px] tracking-wide text-muted uppercase">Observations</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                      {history.length}
                    </dd>
                  </div>
                </dl>

                {/* Schedule control */}
                <form
                  className="mt-4 flex flex-wrap items-center gap-2 text-[13px]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveInterval();
                  }}
                >
                  <label className="text-muted">
                    Scrape every{" "}
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={intervalHours}
                      onChange={(e) => setIntervalHours(Number(e.target.value))}
                      className="h-10 w-16 rounded-lg border border-border bg-background px-2 text-center text-foreground tabular-nums"
                    />{" "}
                    h
                  </label>
                  <button
                    type="submit"
                    disabled={savingInterval}
                    className="h-10 rounded-full border border-border px-3 font-medium text-foreground hover:bg-foreground/10 disabled:opacity-50"
                  >
                    {savingInterval ? "Saving…" : "Save"}
                  </button>
                  {detailError && <span className="text-sm text-danger">{detailError}</span>}
                </form>

                {/* Trend — the sparkline renders its own header (title + value + delta) */}
                <section aria-label="Price trend" className="mt-8">
                  {points.length > 1 ? (
                    <Sparkline data={points} title="Price trend" format={(v) => formatRupees(v)} />
                  ) : (
                    <>
                      <SectionTitle>Price trend</SectionTitle>
                      <p className="mt-3 text-sm text-muted">
                        Not enough validated observations yet — the chart appears from the 2nd scrape on.
                      </p>
                    </>
                  )}
                </section>

                {/* History */}
                <section aria-label="Price history" className="mt-8">
                  <SectionTitle>Price history</SectionTitle>
                  {history.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">No validated observations yet.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[420px] text-sm">
                        <thead>
                          <tr className="text-left text-[13px] text-muted">
                            <th scope="col" className="py-1.5 pr-3 font-medium">Observed</th>
                            <th scope="col" className="py-1.5 pr-3 font-medium">Price</th>
                            <th scope="col" className="py-1.5 font-medium">Stock</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((entry) => (
                            <tr key={entry.observed_at} className="border-t border-border">
                              <td className="py-1.5 pr-3 text-muted">{fullTime(entry.observed_at)}</td>
                              <td className="py-1.5 pr-3 font-medium text-foreground tabular-nums">
                                {formatRupees(entry.price)}
                              </td>
                              <td className="py-1.5 tabular-nums">{entry.stock}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Log */}
                <section aria-label="Scrape log" className="mt-8 pb-12">
                  <SectionTitle>Scrape log</SectionTitle>
                  {log.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">No attempts recorded yet.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[480px] text-sm">
                        <thead>
                          <tr className="text-left text-[13px] text-muted">
                            <th scope="col" className="py-1.5 pr-3 font-medium">#</th>
                            <th scope="col" className="py-1.5 pr-3 font-medium">Attempted</th>
                            <th scope="col" className="py-1.5 pr-3 font-medium">Outcome</th>
                            <th scope="col" className="py-1.5 font-medium">Detail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {log.map((entry) => (
                            <tr key={`${entry.attempted_at}-${entry.attempt_number}`} className="border-t border-border">
                              <td className="py-1.5 pr-3 tabular-nums">{entry.attempt_number}</td>
                              <td className="py-1.5 pr-3 text-muted">{fullTime(entry.attempted_at)}</td>
                              <td className="py-1.5 pr-3">
                                <StatusPill outcome={entry.outcome} />
                              </td>
                              <td className="py-1.5 text-muted">
                                {entry.outcome === "success"
                                  ? `${formatRupees(entry.price ?? 0)} · ${entry.stock}`
                                  : (entry.error_code ?? entry.error_message ?? "—")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            );
          })()}
      </main>
    </>
  );
}
