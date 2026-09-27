import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/app/AppShell";
import { ConfirmDialog } from "../components/app/ConfirmDialog";
import { ExportDialog } from "../components/app/ExportDialog";
import { ManualScrapeDialog } from "../components/app/ManualScrapeDialog";
import { Card, Eyebrow, ProductMark } from "../components/app/primitives";
import { PrimaryButton, SecondaryButton } from "../components/app/controls";
import { ScrapeLogTable } from "../components/app/ScrapeLogTable";
import { AlertBadge, OutcomeBadge, StockBadge } from "../components/app/status";
import { Tabs } from "../components/app/Tabs";
import { TrackingSettingsForm } from "../components/app/TrackingSettingsForm";
import { RelativeTime } from "../components/ui/relative-time";
import { Odometer } from "../components/ui/odometer";
import { Sparkline } from "../components/ui/sparkline";
import { toast } from "../components/ui/toast-stack";
import { formatRupees, nextScrapeIn } from "../lib/format";
import { filterByRange, RANGE_LABEL, type HistoryRange } from "../lib/historyRange";
import { goHash, parseTab, trackedHref, useRoute } from "../router";
import {
  fetchAlerts,
  fetchHistory,
  fetchProduct,
  fetchScrapeLog,
  listTracked,
  untrackTarget,
  type AlertItem,
  type AttemptEntry,
  type HistoryEntry,
  type ProductDetail,
  type TrackedTarget,
} from "../services/api";

type ViewState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      target: TrackedTarget;
      history: HistoryEntry[];
      log: AttemptEntry[];
      alerts: AlertItem[];
      /** Store catalogue detail (brand, specs, reviews) — advisory only. */
      detail: ProductDetail | null;
    };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "Price History" },
  { id: "log", label: "Scrape Log" },
  { id: "settings", label: "Settings" },
];
const RANGES: HistoryRange[] = ["7d", "30d", "90d", "all"];

function shortLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

/** camelCase spec keys ("inTheBox") read as words ("In the box"). */
function humanSpecKey(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function alertLabel(alert: AlertItem): string {
  if (alert.type === "price_drop") {
    return alert.toPrice == null
      ? `Price drop ${alert.dropPct}%`
      : `Price drop ${alert.dropPct}% — now ${formatRupees(alert.toPrice)}`;
  }
  if (alert.type === "back_in_stock") {
    return alert.stock == null ? "Back in stock" : `Back in stock (${alert.stock})`;
  }
  return `Scrape failed${alert.errorCode ? ` — ${alert.errorCode}` : ""}`;
}

/** Tracked-product workspace: overview, history, scrape log, and settings. */
export function TrackedProduct({ targetId }: { targetId: string }) {
  const [, , , , hash] = useRoute();
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [tab, setTab] = useState(() => (TABS.some((item) => item.id === parseTab(hash)) ? parseTab(hash) : "overview"));
  const [range, setRange] = useState<HistoryRange>("all");
  const [manualOpen, setManualOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const targets = await listTracked();
      const target = targets.find((item) => item.id === targetId);
      if (!target) {
        setState({ kind: "missing" });
        return;
      }
      const [history, log, allAlerts, detail] = await Promise.all([
        fetchHistory(targetId, 200),
        fetchScrapeLog(targetId, 200),
        fetchAlerts(),
        // Catalogue detail is advisory: the page must survive the store
        // being unreachable — price truth comes from scraped history.
        fetchProduct(target.storeProductId).catch(() => null),
      ]);
      setState({
        kind: "ready",
        target,
        history,
        log,
        alerts: allAlerts.filter((alert) => alert.trackedProductId === targetId),
        detail,
      });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not load this target",
      });
    }
  }, [targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const next = parseTab(hash);
    if (TABS.some((item) => item.id === next) && next !== tab) setTab(next);
  }, [hash, tab]);

  function changeTab(next: string) {
    setTab(next);
    goHash(trackedHref(targetId, next === "overview" ? undefined : next));
  }

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  // Silent refresh for post-scrape: load() flashes the loading skeleton,
  // which unmounts the ready branch (and the open dialog with it) — the
  // remounted dialog would fire a second POST. This keeps the view mounted
  // so the dialog reaches its success state exactly once.
  const refreshQuiet = useCallback(async () => {
    try {
      const targets = await listTracked();
      const target = targets.find((item) => item.id === targetId);
      if (!target) return;
      const [history, log, allAlerts, detail] = await Promise.all([
        fetchHistory(targetId, 200),
        fetchScrapeLog(targetId, 200),
        fetchAlerts(),
        fetchProduct(target.storeProductId).catch(() => null),
      ]);
      setState({
        kind: "ready",
        target,
        history,
        log,
        alerts: allAlerts.filter((alert) => alert.trackedProductId === targetId),
        detail,
      });
    } catch {
      // Quiet path never breaks the visible page; next navigation reloads.
    }
  }, [targetId]);

  async function remove() {
    setRemoving(true);
    setRemoveError(null);
    try {
      await untrackTarget(targetId);
      toast("Removed from tracking", "Attempts and history stay in the export.");
      goHash("#/app");
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "Could not remove this target");
    } finally {
      setRemoving(false);
    }
  }

  if (state.kind !== "ready") {
    return (
      <AppShell
        active="dashboard"
        crumbs={[{ label: "Dashboard", href: "#/app" }, { label: "Tracked product" }]}
        title="Tracked product"
      >
        {state.kind === "loading" && (
          <div role="status" className="grid gap-4">
            <div className="h-8 w-2/3 rounded bg-foreground/10 motion-safe:animate-pulse" />
            <div className="h-48 rounded-2xl bg-foreground/10 motion-safe:animate-pulse" />
            <p className="sr-only">Loading tracked product…</p>
          </div>
        )}
        {state.kind === "missing" && (
          <Card className="text-center">
            <h2 className="text-lg font-semibold">Target not found</h2>
            <p className="mt-1 text-sm text-muted">
              This id is not tracked anymore — it may have been untracked.
            </p>
            <div className="mt-4">
              <SecondaryButton onClick={() => goHash("#/app")}>Back to dashboard</SecondaryButton>
            </div>
          </Card>
        )}
        {state.kind === "error" && (
          <Card>
            <p role="alert" className="text-sm font-semibold text-danger">
              Could not load this target: {state.message}
            </p>
            <div className="mt-4">
              <SecondaryButton onClick={() => void load()}>Retry</SecondaryButton>
            </div>
          </Card>
        )}
      </AppShell>
    );
  }

  const { target, history, log, alerts, detail } = state;
  // Human option name first ("Starter bundle"), raw id kept for evidence.
  const optionName = target.optionLabel ?? target.selectedOption;
  const rangedHistory = filterByRange(history, (entry) => entry.observed_at, range);
  const prices = rangedHistory.map((entry) => entry.price);
  // History arrives newest-first: index 0 is the current price, the last
  // index the oldest loaded observation.
  const highest = prices.length > 0 ? Math.max(...prices) : null;
  const lowest = prices.length > 0 ? Math.min(...prices) : null;
  const current = prices.length > 0 ? (prices[0] ?? null) : null;
  const first = prices.length > 0 ? (prices[prices.length - 1] ?? null) : null;
  // One observation has no past to compare against: show no delta pill
  // rather than a "0.0%" that implies a measured flatline.
  const change =
    prices.length > 1 && current !== null && first !== null && first !== 0
      ? ((current - first) / first) * 100
      : null;
  const changePct = change;
  const points = rangedHistory
    .slice()
    .reverse()
    .map((entry) => ({ label: shortLabel(entry.observed_at), value: entry.price }));

  return (
    <AppShell
      active="dashboard"
      crumbs={[{ label: "Dashboard", href: "#/app" }, { label: target.productName }]}
      title={`${target.productName} (${optionName})`}
      description={`Last scraped ${target.lastScrape ? new Date(target.lastScrape.attemptedAt).toLocaleString() : "never"}`}
      actions={
        <>
          <SecondaryButton onClick={() => setExportOpen(true)}>Export CSV</SecondaryButton>
          <PrimaryButton onClick={() => setManualOpen(true)}>Run manual scrape</PrimaryButton>
        </>
      }
    >
      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <ProductMark name={target.productName} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              {target.latest ? (
                <span className="flex items-baseline gap-1.5">
                  <span aria-hidden className="text-xl text-muted">
                    ₹
                  </span>
                  <Odometer
                    value={target.latest.price}
                    className="text-3xl leading-none font-semibold tracking-tight text-foreground tabular-nums sm:text-4xl"
                  />
                </span>
              ) : (
                <p className="text-3xl font-semibold tracking-tight text-muted sm:text-4xl">
                  No validated price
                </p>
              )}
              {change !== null && changePct !== null && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums ${
                    change < 0
                      ? "bg-success/10 text-success"
                      : change > 0
                        ? "bg-danger/10 text-danger"
                        : "bg-surface text-muted"
                  }`}
                >
                  {change < 0 ? (
                    <span aria-hidden>▼</span>
                  ) : change > 0 ? (
                    <span aria-hidden>▲</span>
                  ) : (
                    <span aria-hidden>•</span>
                  )}{" "}
                  <span className="sr-only">
                    {change < 0 ? "down " : change > 0 ? "up " : "unchanged "}
                  </span>
                  {Math.abs(changePct).toFixed(1)}% (
                  {change < 0 ? "-" : change > 0 ? "+" : ""}
                  {formatRupees(Math.abs(change))})
                </span>
              )}
              <StockBadge stock={target.latest?.stock} />
              {target.lastScrape && <OutcomeBadge outcome={target.lastScrape.outcome} />}
            </div>
            <p className="mt-2 text-sm text-muted tabular-nums">
              {target.storeProductId} · {optionName} · {target.selectedOption}
              {target.sku !== null && <> · SKU {target.sku}</>} ·{" "}
              <a
                href={target.productUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Store page
              </a>
            </p>
            {alerts.length > 0 && (
              <ul className="mt-3 grid gap-2">
                {alerts.slice(0, 3).map((alert, index) => (
                  <li
                    key={`${alert.type}-${index}`}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <AlertBadge type={alert.type} />
                    <span className="text-muted">{alertLabel(alert)}</span>
                  </li>
                ))}
              </ul>
            )}
            {target.lastScrape?.outcome === "failed" && (
              <p role="alert" className="mt-3 max-w-xl rounded-xl bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
                Latest scrape failed. Showing the last validated observation, not fresh data.
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="mt-6">
        <Tabs label="Tracked product sections" tabs={TABS} value={tab} onChange={changeTab} />
      </div>

      {tab === "overview" && (
        <div className="mt-6 grid gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Highest", value: highest },
              { label: "Lowest", value: lowest },
              { label: "Current", value: current },
            ].map((stat) => (
              <Card key={stat.label} className="p-4">
                <Eyebrow>{stat.label}</Eyebrow>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {stat.value === null ? "—" : formatRupees(stat.value)}
                </p>
              </Card>
            ))}
          </div>
          <PriceChart
            points={points}
            range={range}
            onRange={setRange}
            loaded={history.length}
          />
          <Card>
            <Eyebrow>Schedule</Eyebrow>
            <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">Last success</dt>
                <dd className="mt-1 font-semibold">
                  {target.latest ? <RelativeTime date={target.latest.observedAt} /> : "never"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Next scrape</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {nextScrapeIn(target.lastScrape?.attemptedAt, target.scrapeIntervalHours)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Interval</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  every {target.scrapeIntervalHours ?? 2} h
                </dd>
              </div>
              <div>
                <dt className="text-muted">Loaded observations</dt>
                <dd className="mt-1 font-semibold tabular-nums">{history.length}</dd>
              </div>
            </dl>
          </Card>
          {detail !== null && (
            <Card>
              <Eyebrow>About this product</Eyebrow>
              <p className="mt-2 text-sm text-muted">
                {[detail.brand, detail.category].filter(Boolean).join(" · ")}
                {detail.sku !== null && ` · SKU ${detail.sku}`}
              </p>
              {detail.description !== null && (
                <p className="mt-2 text-sm text-foreground">{detail.description}</p>
              )}
              {detail.specs !== null && Object.keys(detail.specs).length > 0 && (
                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {Object.entries(detail.specs).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <dt className="shrink-0 text-muted">{humanSpecKey(key)}</dt>
                      <dd className="font-medium tabular-nums">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {detail.reviews.length > 0 && (
                <ul className="mt-4 grid gap-3">
                  {detail.reviews.slice(0, 3).map((review) => (
                    <li key={`${review.author}-${review.title}`} className="text-sm">
                      <p className="font-semibold">
                        {review.title ?? "Review"}
                        {review.rating !== null && (
                          <span className="ml-2 font-normal text-muted tabular-nums">
                            {review.rating}/5 · {review.author}
                            {review.verifiedPurchase && " · verified"}
                          </span>
                        )}
                      </p>
                      {review.body !== null && (
                        <p className="mt-0.5 text-muted">{review.body}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="mt-6 grid gap-6">
          <PriceChart
            points={points}
            range={range}
            onRange={setRange}
            loaded={history.length}
          />
          <Card>
            <Eyebrow>Price history</Eyebrow>
            {rangedHistory.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No validated observations in this range.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-left text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
                      <th scope="col" className="py-2 pr-3">Observed</th>
                      <th scope="col" className="py-2 pr-3">Price</th>
                      <th scope="col" className="py-2">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rangedHistory.map((entry) => (
                      <tr key={entry.observed_at} className="border-t border-border">
                        <td className="py-2 pr-3 whitespace-nowrap text-muted tabular-nums">
                          {(() => {
                            const d = new Date(entry.observed_at);
                            return Number.isNaN(d.getTime())
                              ? entry.observed_at
                              : d.toLocaleString();
                          })()}
                        </td>
                        <td className="py-2 pr-3 font-semibold tabular-nums">
                          {formatRupees(entry.price)}
                        </td>
                        <td className="py-2 tabular-nums">{entry.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "log" && (
        <div className="mt-6 grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Every attempt is listed, including retries and failures.
            </p>
            <SecondaryButton onClick={() => setExportOpen(true)}>Export CSV</SecondaryButton>
          </div>
          <ScrapeLogTable log={log} />
        </div>
      )}

      {tab === "settings" && (
        <div className="mt-6 grid gap-6">
          <Card>
            <TrackingSettingsForm
              targetId={target.id}
              productName={target.productName}
              initialHours={target.scrapeIntervalHours ?? 2}
              onSaved={refresh}
            />
          </Card>
          <Card>
            <h2 className="text-sm font-semibold text-danger">Remove from tracking</h2>
            <p className="mt-1 text-sm text-muted">
              Untracking is a soft delete: attempts and history stay available in exports.
            </p>
            {removeError && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {removeError}
              </p>
            )}
            <div className="mt-4">
              <SecondaryButton onClick={() => setRemoveOpen(true)}>
                Remove this product
              </SecondaryButton>
            </div>
          </Card>
        </div>
      )}

      <ManualScrapeDialog
        open={manualOpen}
        targetId={target.id}
        productName={target.productName}
        onClose={() => setManualOpen(false)}
        onFinished={() => void refreshQuiet()}
      />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} target={target} />
      <ConfirmDialog
        open={removeOpen}
        title="Remove this product?"
        body="It will leave the dashboard, but its attempts and validated history stay in exports."
        confirmLabel="Remove"
        busy={removing}
        onCancel={() => setRemoveOpen(false)}
        onConfirm={() => void remove()}
      />
    </AppShell>
  );
}

function PriceChart({
  points,
  range,
  onRange,
  loaded,
}: {
  points: Array<{ label: string; value: number }>;
  range: HistoryRange;
  onRange: (range: HistoryRange) => void;
  loaded: number;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>Price history</Eyebrow>
        <div role="group" aria-label="History range" className="flex gap-1 rounded-xl bg-surface p-1">
          {RANGES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === range}
              onClick={() => onRange(item)}
              className={`min-h-9 rounded-lg px-3 text-[13px] font-semibold ${
                item === range ? "bg-card text-primary shadow-raised" : "text-muted hover:text-foreground"
              }`}
            >
              {RANGE_LABEL[item]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        {points.length > 1 ? (
          <Sparkline data={points} title="Price trend" format={(value) => formatRupees(value)} />
        ) : (
          <p className="text-sm text-muted">
            Not enough validated observations yet — the chart appears from the 2nd scrape on.
          </p>
        )}
      </div>
      <p className="mt-3 text-[13px] text-muted">
        Ranges filter the latest {loaded} loaded checks; the backend has no date-range query.
      </p>
    </Card>
  );
}
