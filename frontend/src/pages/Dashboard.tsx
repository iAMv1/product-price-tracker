import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { TargetCard } from "../components/TargetCard";
import { SectionTitle, SiteNav } from "../components/site-nav";
import { ExpandingSearch } from "../components/ui/expanding-search";
import { ExportButton, type ExportStatus } from "../components/ui/export-button";
import { RelativeTime } from "../components/ui/relative-time";
import { formatRupees } from "../lib/format";
import {
  ApiError,
  exportCsvUrl,
  fetchAlerts,
  fetchChangeEvents,
  fetchHealth,
  fetchProduct,
  fetchRuns,
  listTracked,
  searchProducts,
  trackByProduct,
  trackProduct,
  type AlertItem,
  type ChangeEvent,
  type HealthResponse,
  type ProductDetail,
  type RunEntry,
  type SearchHit,
  type TrackedTarget,
} from "../services/api";

type BootState =
  | { kind: "loading" }
  | { kind: "ready"; health: HealthResponse }
  | { kind: "error"; message: string };

export default function Dashboard() {
  const reduceMotion = useReducedMotion();
  const [boot, setBoot] = useState<BootState>({ kind: "loading" });
  const [targets, setTargets] = useState<TrackedTarget[]>([]);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  /** Last query that actually ran — keeps type-ahead and Enter from double-fetching. */
  const lastSearched = useRef("");

  const [picked, setPicked] = useState<ProductDetail | null>(null);
  const [pickedOption, setPickedOption] = useState("");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [changes, setChanges] = useState<ChangeEvent[]>([]);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [pickedMulti, setPickedMulti] = useState<string[]>([]);
  const [bulkTracking, setBulkTracking] = useState(false);
  const [newInterval, setNewInterval] = useState(2);
  const resetExport = useCallback(() => setExportStatus("idle"), []);

  const refreshTargets = useCallback(async () => {
    try {
      setTargets(await listTracked());
      setTargetsError(null);
    } catch (error) {
      setTargetsError(error instanceof Error ? error.message : "Unknown error");
    }
    try {
      const [a, c, r] = await Promise.all([fetchAlerts(), fetchChangeEvents(), fetchRuns()]);
      setAlerts(a);
      setChanges(c);
      setRuns(r);
    } catch {
      // Alerts/change/runs feed is bonus UX: dashboard works without it.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const [health, list] = await Promise.all([fetchHealth(), listTracked()]);
        if (!cancelled) {
          setBoot({ kind: "ready", health });
          setTargets(list);
          Promise.all([fetchAlerts(), fetchChangeEvents(), fetchRuns()])
            .then(([a, c, r]) => {
              if (!cancelled) {
                setAlerts(a);
                setChanges(c);
                setRuns(r);
              }
            })
            .catch(() => {});
        }
      } catch (error: unknown) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 503) {
          // Backend is up but the database is not wired yet: boot read-only.
          setTargetsError(error.message);
          try {
            const health = await fetchHealth();
            if (!cancelled) setBoot({ kind: "ready", health });
          } catch (inner: unknown) {
            if (!cancelled) {
              setBoot({
                kind: "error",
                message: inner instanceof Error ? inner.message : "Unknown error",
              });
            }
          }
          return;
        }
        setBoot({
          kind: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function searchCore(t: string) {
    lastSearched.current = t;
    setSearching(true);
    setSearchError(null);
    try {
      setHits(await searchProducts(t));
    } catch (error) {
      lastSearched.current = ""; // let Enter or the next keystroke retry
      setHits(null);
      setSearchError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSearching(false);
    }
  }

  function runSearch(q: string) {
    setQuery(q);
    setPicked(null);
    const t = q.trim();
    if (t === "") {
      lastSearched.current = "";
      setHits(null);
      setSearchError(null);
      return;
    }
    if (lastSearched.current !== t) void searchCore(t);
  }

  // Type-ahead: results follow keystrokes after a 300ms breath (Doherty band).
  // Enter still searches instantly via runSearch above.
  useEffect(() => {
    const t = query.trim();
    if (t === "" || lastSearched.current === t) return;
    setPicked(null);
    const timer = setTimeout(() => {
      if (lastSearched.current === t) return; // Enter already fetched it
      void searchCore(t);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function pickProduct(hit: SearchHit) {
    setDetailError(null);
    setPickedOption("");
    setPickedMulti([]);
    try {
      const detail = await fetchProduct(hit.storeProductId);
      setPicked(detail);
      setPickedOption(detail.options[0]?.id ?? "");
      setPickedMulti(detail.options[0]?.id ? [detail.options[0].id] : []);
    } catch (error) {
      setPicked(null);
      setDetailError(error instanceof Error ? error.message : "Unknown error");
    }
  }

  async function trackSelectedOptions() {
    if (picked === null || pickedMulti.length === 0 || pickedMulti.length > 8) return;
    setTracking(true);
    setTrackError(null);
    setNotice(null);
    try {
      const summary = await trackByProduct(picked.storeProductId, pickedMulti, newInterval);
      setNotice(
        `Tracking ${pickedMulti.length} option${pickedMulti.length === 1 ? "" : "s"} of ${picked.name} in one run: ${summary.succeeded} succeeded, ${summary.failed} failed.`,
      );
      setPicked(null);
      setPickedMulti([]);
      setHits(null);
      await refreshTargets();
    } catch (error) {
      setTrackError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setTracking(false);
      setBulkTracking(false);
    }
  }

  async function track() {
    if (picked === null || pickedOption === "") return;
    setTracking(true);
    setTrackError(null);
    setNotice(null);
    try {
      const result = await trackProduct(picked.storeProductId, pickedOption, newInterval);
      setNotice(
        result.deduped
          ? `Already tracking ${result.productName} (${result.selectedOption}).`
          : result.firstScrape?.outcome === "success"
            ? `Tracking ${result.productName} (${result.selectedOption}). First scrape succeeded.`
            : `Tracking ${result.productName} (${result.selectedOption}). First scrape failed and is logged honestly.`,
      );
      setPicked(null);
      setHits(null);
      await refreshTargets();
    } catch (error) {
      setTrackError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setTracking(false);
    }
  }

  async function untrack(id: string) {
    try {
      const response = await fetch(`/api/tracked-products/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(`untrack failed with HTTP ${response.status}`);
      await refreshTargets();
    } catch (error) {
      setTargetsError(error instanceof Error ? error.message : "Unknown error");
    }
  }

  async function downloadCsv() {
    setExportStatus("working");
    try {
      const response = await fetch(exportCsvUrl());
      if (!response.ok) throw new Error(`export failed with HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "scrape-history.csv";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setExportStatus("done");
    } catch (error) {
      setExportStatus("idle");
      setNotice(error instanceof Error ? error.message : "Export failed.");
    }
  }

  const dbDown =
    boot.kind === "ready" && !boot.health.integrations.database;

  return (
    <>
      <SiteNav variant="app" />
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-8 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            <a href="#/">Product Price Tracker</a>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Validated observations only. Failures stay visible. Scraped every 2 hours.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportButton
            status={exportStatus}
            onExport={downloadCsv}
            onReset={resetExport}
          />
        </div>
      </header>

      {boot.kind === "loading" && (
        <div role="status" className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-border bg-surface p-5">
              <div className="h-4 w-2/3 rounded bg-foreground/10" />
              <div className="mt-3 h-8 w-1/3 rounded bg-foreground/10" />
              <div className="mt-3 h-3 w-1/2 rounded bg-foreground/10" />
            </div>
          ))}
          <p className="sr-only">Contacting backend…</p>
        </div>
      )}
      {boot.kind === "error" && (
        <div role="alert" className="mt-8 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          <p>Backend unreachable: {boot.message}. Start it with <code>npm run dev:backend</code>.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 h-10 rounded-full border border-danger/40 px-4 text-[13px] font-medium hover:bg-danger/10"
          >
            Retry
          </button>
        </div>
      )}

      {boot.kind === "ready" && (
        <>
          {dbDown && (
            <p role="status" className="mt-6 rounded-2xl bg-surface px-4 py-3 text-sm text-muted shadow-raised">
              Database not configured. Tracking is disabled, catalogue search still works.
            </p>
          )}
          {notice && (
            <p role="status" className="mt-6 rounded-2xl bg-surface px-4 py-3 text-sm font-medium text-foreground shadow-raised">
              {notice}
            </p>
          )}

          <section aria-label="Overview" className="mt-8">
            <SectionTitle
              right={
                <span className="text-[13px] text-muted tabular-nums">
                  {targets.length} target{targets.length === 1 ? "" : "s"}
                </span>
              }
            >
              Overview
            </SectionTitle>
            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface shadow-raised">
              <dl className="grid grid-cols-2 sm:grid-cols-4">
                {(() => {
                  const failedCount = targets.filter((t) => t.lastScrape?.outcome === "failed").length;
                  const alertCount = alerts.length;
                  const stats = [
                    { label: "Tracked", value: targets.length, tone: "" },
                    {
                      label: "Validated",
                      value: targets.filter((t) => t.latest !== null).length,
                      tone: "",
                    },
                    {
                      label: "Failed last scrape",
                      value: failedCount,
                      tone: failedCount > 0 ? "text-danger" : "",
                    },
                    {
                      label: "Active alerts",
                      value: alertCount,
                      tone: alertCount > 0 ? "text-marker" : "",
                    },
                  ];
                  return stats.map((s) => (
                    <div
                      key={s.label}
                      className={[
                        "border-border px-5 py-4",
                        "[&:nth-child(odd)]:border-r sm:[&:nth-child(odd)]:border-r-0",
                        "[&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-t-0",
                        "sm:border-l sm:first:border-l-0",
                      ].join(" ")}
                    >
                      <dt className="text-[12px] font-medium tracking-[0.08em] text-muted uppercase">
                        {s.label}
                      </dt>
                      <dd
                        className={`mt-1 text-[28px] leading-none font-semibold tabular-nums ${s.tone}`}
                      >
                        {s.value}
                      </dd>
                    </div>
                  ));
                })()}
              </dl>
              {(() => {
                const prices = targets
                  .map((t) => t.latest?.price)
                  .filter((p): p is number => typeof p === "number");
                if (prices.length === 0) return null;
                const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
                return (
                  <p className="flex items-center justify-between border-t border-border px-5 py-3 text-[13px] text-muted">
                    <span>Average validated price</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatRupees(avg)}
                    </span>
                  </p>
                );
              })()}
            </div>
          </section>

          {alerts.length > 0 && (
            <section
              aria-label="Alerts"
              className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3.5"
            >
              <h2 className="text-[13px] font-semibold text-amber-700 dark:text-amber-400">
                Alerts
              </h2>
              <ul className="mt-1.5 grid gap-1.5 text-[13px]">
                {alerts.map((a, i) => (
                  <li key={`${a.trackedProductId}-${a.type}-${i}`} className="text-foreground">
                    <span className="font-semibold">
                      {a.type === "price_drop"
                        ? `Price drop ${a.dropPct}%`
                        : a.type === "back_in_stock"
                          ? "Back in stock"
                          : "Scrape failed"}
                    </span>{" "}
                    <span className="text-muted tabular-nums">
                      {a.productName} ({a.selectedOption})
                      {a.type === "price_drop"
                        ? ` ${formatRupees(a.fromPrice ?? 0)} → ${formatRupees(a.toPrice ?? 0)}`
                        : ""}
                      {a.type === "back_in_stock" ? ` stock ${a.stock}` : ""}
                      {a.type === "scrape_failed" ? ` ${a.errorCode ?? ""}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {changes.length > 0 && (
            <p role="alert" className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-[13px] font-medium text-danger">
              Store structure watch: {changes.length} structure flag
              {changes.length === 1 ? "" : "s"} ({changes.slice(0, 3).map((c) => c.error_code).join(", ")}
              ). Selectors may have drifted — check scrape log.
            </p>
          )}

          <section aria-label="Search and track" className="mt-10">
            <div className="flex items-center gap-3">
              <h2 className="text-[15px] font-semibold text-foreground">
                Find a product{" "}
                <kbd className="ml-1 rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[12px] text-muted">/</kbd>
              </h2>
              <span aria-hidden className="h-px flex-1 bg-border" />
              <ExpandingSearch
                placeholder="Product name"
                onSearch={runSearch}
                onQueryChange={setQuery}
                onOpenChange={(open) => {
                  if (!open) {
                    setHits(null);
                    setQuery("");
                  }
                }}
              />
            </div>
            <p aria-live="polite" className="mt-2 text-[13px] text-muted tabular-nums">
              {searching
                ? "Searching the mock store…"
                : hits === null
                  ? `${targets.length} tracked target${targets.length === 1 ? "" : "s"} below. The store holds 960 products.`
                  : `${hits.length} match${hits.length === 1 ? "" : "es"}${query ? ` for \u201c${query}\u201d` : ""}`}
            </p>
            {searchError && <p className="mt-2 text-sm text-danger">{searchError}</p>}
            {hits !== null && (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {hits.map((hit) => (
                  <li key={hit.storeProductId}>
                    <button
                      type="button"
                      onClick={() => pickProduct(hit)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-2xl border border-border bg-surface px-4 py-3 text-left shadow-raised outline-hidden transition-[scale,border-color] duration-150 ease-out select-none hover:border-foreground/40 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.99] motion-reduce:transition-[border-color]"
                    >
                      <span className="text-[15px] font-semibold text-foreground">{hit.name}</span>
                      <span className="text-[13px] text-muted tabular-nums">
                        {hit.storeProductId}
                        {hit.brand ? ` · ${hit.brand}` : ""}
                        {hit.category ? ` · ${hit.category}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
                {hits.length === 0 && (
                  <li className="py-8 text-center text-sm text-muted">
                    No products match “{query}”.
                  </li>
                )}
              </ul>
            )}

            {detailError && <p className="mt-3 text-sm text-danger">{detailError}</p>}
            {picked !== null && (
              <div className="mt-3 rounded-2xl border border-border bg-surface p-5 shadow-raised">
                <h3 className="text-[15px] font-semibold text-foreground">{picked.name}</h3>
                <p className="text-[13px] text-muted tabular-nums">
                  {picked.storeProductId}
                  {picked.optionAxis ? ` · options: ${picked.optionAxis}` : ""}
                </p>
                <label className="mt-3 grid gap-1.5 text-sm font-medium text-foreground">
                  Option to track
                  <select
                    value={pickedOption}
                    onChange={(event) => setPickedOption(event.target.value)}
                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-normal outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
                  >
                    {picked.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.id} — {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="mt-3">
                  <legend className="text-sm font-medium text-foreground">
                    Options for one-run multi scrape (max 8)
                  </legend>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {picked.options.map((option) => {
                      const checked = pickedMulti.includes(option.id);
                      return (
                        <label
                          key={option.id}
                          className="flex h-10 cursor-pointer touch-manipulation items-center gap-1.5 rounded-full border border-border px-3 text-[13px] text-foreground select-none has-checked:border-foreground has-checked:bg-foreground/10"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setPickedMulti((prev) =>
                                prev.includes(option.id)
                                  ? prev.filter((id) => id !== option.id)
                                  : [...prev, option.id].slice(0, 8),
                              )
                            }
                            className="h-4 w-4 accent-current"
                          />
                          {option.id}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                  Scrape every
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={newInterval}
                    onChange={(e) => setNewInterval(Math.min(168, Math.max(1, Math.round(Number(e.target.value) || 2))))}
                    className="h-10 w-20 rounded-xl border border-border bg-background px-2 tabular-nums"
                  />
                  hour(s)
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={track}
                    disabled={tracking || pickedOption === ""}
                    className="h-10 touch-manipulation rounded-full bg-foreground px-5 text-sm font-medium text-background outline-hidden transition-[scale,opacity] duration-150 ease-out select-none hover:opacity-90 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[opacity] disabled:opacity-50"
                  >
                    {tracking ? "Tracking…" : "Track this option"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkTracking(true);
                      void trackSelectedOptions();
                    }}
                    disabled={tracking || pickedMulti.length === 0 || pickedMulti.length > 8}
                    className="h-10 touch-manipulation rounded-full border border-border px-5 text-sm font-medium text-foreground outline-hidden transition-[scale,background-color] duration-150 ease-out select-none hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[background-color] disabled:opacity-50"
                  >
                    {bulkTracking ? "Tracking…" : `Track ${pickedMulti.length} option${pickedMulti.length === 1 ? "" : "s"} in one run`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPicked(null)}
                    className="h-10 touch-manipulation rounded-full px-5 text-sm font-medium text-foreground outline-hidden transition-[scale,background-color] duration-150 ease-out select-none hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[background-color]"
                  >
                    Cancel
                  </button>
                </div>
                {trackError && <p className="mt-3 text-sm text-danger">{trackError}</p>}
              </div>
            )}
          </section>

          {runs.length > 0 && (
            <section aria-label="Recent runs" className="mt-8">
              <SectionTitle
                right={<span className="text-[13px] text-muted">every 2 hours</span>}
              >
                Recent runs
              </SectionTitle>
              <ol className="mt-3 flex flex-wrap gap-2">
                {runs.slice(0, 8).map((run) => (
                  <li
                    key={run.id}
                    className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] tabular-nums"
                    title={`${run.triggerType} · ${run.targetCount} targets`}
                  >
                    <RelativeTime date={run.startedAt} />
                    <span className="text-muted">{run.triggerType}</span>
                    <span className="font-medium text-foreground">
                      {run.successCount}✓{run.failureCount > 0 ? ` ${run.failureCount}✗` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-label="Tracked products" className="mt-10">
            <SectionTitle
              right={
                <span className="text-[13px] text-muted tabular-nums">
                  {targets.length}
                </span>
              }
            >
              Tracked
            </SectionTitle>
            {targetsError && <p className="mt-2 text-sm text-danger">{targetsError}</p>}
            {targets.length === 0 && targetsError === null && (
              <p className="mt-2 text-sm text-muted">
                Nothing tracked yet. Expand the search above to add the first target.
              </p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {targets.map((target, i) => (
                <motion.div
                  key={target.id}
                  className="h-full"
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: Math.min(i * 0.06, 0.3), ease: [0.23, 1, 0.32, 1] }}
                >
                  <TargetCard
                    target={target}
                    onChanged={refreshTargets}
                    onUntracked={untrack}
                  />
                </motion.div>
              ))}
            </div>
          </section>

          <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
            <p>
              Backend {boot.health.environment} · DB{" "}
              {boot.health.integrations.database ? "connected" : "not configured"} · scrapes every
              2 hours via external cron · components adapted from xevrion/ui-lab (MIT)
            </p>
            <p className="flex gap-4">
              <a href="#/" className="hover:text-foreground">Landing</a>
              <a href="#/docs" className="hover:text-foreground">Docs</a>
              <a href="#/changelog" className="hover:text-foreground">Changelog</a>
            </p>
          </footer>
        </>
      )}
    </main>
    </>
  );
}
