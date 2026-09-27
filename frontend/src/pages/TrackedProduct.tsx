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
import { Sparkline } from "../components/ui/sparkline";
import { toast } from "../components/ui/toast-stack";
import { formatRupees, nextScrapeIn } from "../lib/format";
import { filterByRange, RANGE_LABEL, type HistoryRange } from "../lib/historyRange";
import { goHash, parseTab, trackedHref, useRoute } from "../router";
import {
  fetchAlerts,
  fetchHistory,
  fetchScrapeLog,
  listTracked,
  untrackTarget,
  type AlertItem,
  type AttemptEntry,
  type HistoryEntry,
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
      const [history, log, allAlerts] = await Promise.all([
        fetchHistory(targetId, 200),
        fetchScrapeLog(targetId, 200),
        fetchAlerts(),
      ]);
      setState({
        kind: "ready",
        target,
        history,
        log,
        alerts: allAlerts.filter((alert) => alert.trackedProductId === targetId),
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

  const { target, history, log, alerts } = state;
  const rangedHistory = filterByRange(history, (entry) => entry.observed_at, range);
  const prices = rangedHistory.map((entry) => entry.price);
  const highest = prices.length > 0 ? Math.max(...prices) : null;
  const lowest = prices.length > 0 ? Math.min(...prices) : null;
  const current = prices.length > 0 ? prices[prices.length - 1] ?? null : null;
  const first = prices.length > 0 ? prices[0] ?? null : null;
  const change = current !== null && first !== null && first !== 0 ? current - first : null;
  const changePct = change !== null && first ? (change / first) * 100 : null;
  const points = rangedHistory
    .slice()
    .reverse()
    .map((entry) => ({ label: shortLabel(entry.observed_at), value: entry.price }));

  return (
    <AppShell
      active="dashboard"
      crumbs={[{ label: "Dashboard", href: "#/app" }, { label: target.productName }]}
      title={`${target.productName} (${target.selectedOption})`}
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
              <p className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                {target.latest ? formatRupees(target.latest.price) : "No validated price"}
              </p>
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
                  {change < 0 ? "▼" : change > 0 ? "▲" : "•"} {Math.abs(changePct).toFixed(1)}% (
                  {change < 0 ? "-" : change > 0 ? "+" : ""}
                  {formatRupees(Math.abs(change))})
                </span>
              )}
              <StockBadge stock={target.latest?.stock} />
              {target.lastScrape && <OutcomeBadge outcome={target.lastScrape.outcome} />}
            </div>
            <p className="mt-2 text-sm text-muted tabular-nums">
              {target.storeProductId} · {target.selectedOption} ·{" "}
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
                        <td className="py-2 pr-3 text-muted">
                          {new Date(entry.observed_at).toLocaleString()}
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
        onFinished={refresh}
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
