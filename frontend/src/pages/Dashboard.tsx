import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { TargetCard } from "../components/TargetCard";
import { ExpandingSearch } from "../components/ui/expanding-search";
import { ExportButton, type ExportStatus } from "../components/ui/export-button";
import { Odometer } from "../components/ui/odometer";
import { ThemeToggle } from "../components/ui/theme-toggle";
import {
  ApiError,
  exportCsvUrl,
  fetchAlerts,
  fetchChangeEvents,
  fetchHealth,
  fetchProduct,
  listTracked,
  searchProducts,
  trackByProduct,
  trackProduct,
  type AlertItem,
  type ChangeEvent,
  type HealthResponse,
  type ProductDetail,
  type SearchHit,
  type TrackedTarget,
} from "../services/api";

type BootState =
  | { kind: "loading" }
  | { kind: "ready"; health: HealthResponse }
  | { kind: "error"; message: string };

export default function Dashboard() {
  const [boot, setBoot] = useState<BootState>({ kind: "loading" });
  const [targets, setTargets] = useState<TrackedTarget[]>([]);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [picked, setPicked] = useState<ProductDetail | null>(null);
  const [pickedOption, setPickedOption] = useState("");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [changes, setChanges] = useState<ChangeEvent[]>([]);
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
      const [a, c] = await Promise.all([fetchAlerts(), fetchChangeEvents()]);
      setAlerts(a);
      setChanges(c);
    } catch {
      // Alerts/change feed is bonus UX: dashboard works without it.
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
          Promise.all([fetchAlerts(), fetchChangeEvents()])
            .then(([a, c]) => {
              if (!cancelled) {
                setAlerts(a);
                setChanges(c);
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

  async function runSearch(q: string) {
    setQuery(q);
    setPicked(null);
    if (q.trim() === "") {
      setHits(null);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      setHits(await searchProducts(q));
    } catch (error) {
      setHits(null);
      setSearchError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSearching(false);
    }
  }

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
    const target = targets.find((t) => t.id === id);
    if (
      target === undefined ||
      !window.confirm(
        `Stop tracking ${target.productName} (${target.selectedOption})? Its history is deleted.`,
      )
    ) {
      return;
    }
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

  function downloadCsv() {
    setExportStatus("working");
    const link = document.createElement("a");
    link.href = exportCsvUrl();
    link.download = "scrape-history.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setExportStatus("done");
  }

  const dbDown =
    boot.kind === "ready" && !boot.health.integrations.database;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
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
          <ThemeToggle />
        </div>
      </header>

      {boot.kind === "loading" && <p className="mt-8 text-sm text-muted">Contacting backend…</p>}
      {boot.kind === "error" && (
        <p role="alert" className="mt-8 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          Backend unreachable: {boot.message}. Start it with <code>npm run dev:backend</code>.
        </p>
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

          <section aria-label="Overview" className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-raised sm:p-5">
            <h2 className="text-[15px] font-semibold text-foreground">Overview</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Tracked", value: targets.length, money: false },
                { label: "Validated", value: targets.filter((t) => t.latest !== null).length, money: false },
                { label: "Failed last scrape", value: targets.filter((t) => t.lastScrape?.outcome === "failed").length, money: false },
                { label: "Active alerts", value: alerts.length, money: false },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-background px-3 py-2.5">
                  <dt className="text-[12px] text-muted">{s.label}</dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                    <Odometer value={s.value} />
                  </dd>
                </div>
              ))}
            </dl>
            {(() => {
              const prices = targets
                .map((t) => t.latest?.price)
                .filter((p): p is number => typeof p === "number");
              if (prices.length === 0) return null;
              const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
              return (
                <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
                  Average validated price
                  <span className="font-semibold text-foreground tabular-nums">₹{avg}</span>
                </p>
              );
            })()}
          </section>

          {alerts.length > 0 && (
            <section aria-label="Alerts" className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-raised">
              <h2 className="text-[15px] font-semibold text-foreground">Alerts</h2>
              <ul className="mt-2 grid gap-1.5 text-[13px]">
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
                      {a.type === "price_drop" ? ` ₹${a.fromPrice} → ₹${a.toPrice}` : ""}
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

          <section aria-label="Search and track" className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-foreground">
                Find a product{" "}
                <kbd className="ml-1 rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[12px] text-muted">/</kbd>
              </h2>
              <ExpandingSearch
                placeholder="Product name"
                onSearch={runSearch}
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
                          className="flex h-9 cursor-pointer touch-manipulation items-center gap-1.5 rounded-full border border-border px-3 text-[13px] text-foreground select-none has-checked:border-foreground has-checked:bg-foreground/10"
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
                    className="h-9 w-20 rounded-xl border border-border bg-background px-2 tabular-nums"
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

          <section aria-label="Tracked products" className="mt-10">
            <h2 className="text-[15px] font-semibold text-foreground">Tracked</h2>
            {targetsError && <p className="mt-2 text-sm text-danger">{targetsError}</p>}
            {targets.length === 0 && targetsError === null && (
              <p className="mt-2 text-sm text-muted">
                Nothing tracked yet. Expand the search above to add the first target.
              </p>
            )}
            <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {targets.map((target, i) => (
                <motion.div
                  key={target.id}
                  initial={{ opacity: 0, y: 16 }}
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
  );
}
