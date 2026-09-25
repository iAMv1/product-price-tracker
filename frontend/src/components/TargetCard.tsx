import { useEffect, useState } from "react";
import {
  fetchHistory,
  fetchScrapeLog,
  rescrapeTarget,
  updateInterval,
  type AttemptEntry,
  type HistoryEntry,
  type TrackedTarget,
} from "../services/api";
import { cn } from "../lib/cn";
import { formatRupees, nextScrapeIn } from "../lib/format";
import { Odometer } from "./ui/odometer";
import { RelativeTime } from "./ui/relative-time";
import { Sparkline } from "./ui/sparkline";
import { StatusPill } from "./ui/status-pill";

function shortLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function fullTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * One tracked target: WHAT (product + option), NOW (odometer price +
 * stock), WHEN (relative last success), HEALTH (status pill), TREND
 * (scrubbable sparkline), EVIDENCE (history + attempt tables). A failed
 * latest scrape never overwrites the displayed latest: the backend only
 * projects validated observations, and the card shows both side by side.
 * Actions rank by frequency: Scrape now fills, history ghosts, untrack
 * floats right behind a two-step confirm.
 */
export function TargetCard({
  target,
  onChanged,
  onUntracked,
}: {
  target: TrackedTarget;
  onChanged: () => Promise<void>;
  onUntracked: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [log, setLog] = useState<AttemptEntry[] | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [rescraping, setRescraping] = useState(false);
  const [intervalHours, setIntervalHours] = useState(target.scrapeIntervalHours ?? 2);
  const [savingInterval, setSavingInterval] = useState(false);
  const [confirmUntrack, setConfirmUntrack] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Countdown chip ticks once a minute; cleanup on unmount.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!confirmUntrack) return;
    const timer = setTimeout(() => setConfirmUntrack(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmUntrack]);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (!next || (history !== null && log !== null)) return;
    setDetailError(null);
    try {
      const [h, l] = await Promise.all([fetchHistory(target.id), fetchScrapeLog(target.id)]);
      setHistory(h);
      setLog(l);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Unknown error");
    }
  }

  async function rescrape() {
    setRescraping(true);
    try {
      await rescrapeTarget(target.id);
      await onChanged();
      if (expanded) {
        const [h, l] = await Promise.all([fetchHistory(target.id), fetchScrapeLog(target.id)]);
        setHistory(h);
        setLog(l);
      }
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setRescraping(false);
    }
  }

  async function saveInterval() {
    const hours = Math.min(168, Math.max(1, Math.round(Number(intervalHours) || 2)));
    setSavingInterval(true);
    try {
      await updateInterval(target.id, hours);
      setIntervalHours(hours);
      await onChanged();
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSavingInterval(false);
    }
  }

  const failed = target.lastScrape?.outcome === "failed";
  const points = (history ?? [])
    .slice()
    .reverse()
    .map((h) => ({ label: shortLabel(h.observed_at), value: h.price }));

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-2xl border bg-surface p-5 shadow-raised",
        failed ? "border-danger" : "border-border",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight text-foreground">
            {target.productName}
          </h3>
          <p className="text-[13px] text-muted tabular-nums">
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
      </header>

      <div className="mt-4">
        <p className="text-[13px] text-muted">Current price</p>
        {target.latest ? (
          <div className="mt-1 flex items-baseline gap-1.5">
            <span aria-hidden className="text-xl font-medium text-muted">
              ₹
            </span>
            <Odometer
              value={target.latest.price}
              className="text-[34px] leading-none font-semibold tracking-tight text-foreground"
            />
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">no validated observation yet</p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-[13px] text-muted">Stock</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {target.latest ? target.latest.stock : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Last success</dt>
          <dd className="font-medium text-foreground">
            {target.latest ? (
              <RelativeTime date={target.latest.observedAt} />
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[13px] text-muted">Last scrape</dt>
          <dd className="font-medium text-foreground">
            {target.lastScrape ? (
              <>
                <RelativeTime date={target.lastScrape.attemptedAt} />
                {target.lastScrape.errorCode && (
                  <span className="text-muted"> · {target.lastScrape.errorCode}</span>
                )}
                <span className="text-muted">
                  {" "}· next {nextScrapeIn(target.lastScrape.attemptedAt, target.scrapeIntervalHours, now)}
                </span>
              </>
            ) : (
              "never scraped"
            )}
          </dd>
        </div>
      </dl>

      {failed && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger"
        >
          Latest scrape failed. Showing the last validated observation, not fresh data.
        </p>
      )}

      {points.length > 1 && (
        <div className="mt-4">
          <Sparkline
            data={points}
            title="Price history"
            format={(v) => formatRupees(v)}
          />
        </div>
      )}

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
            className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-center text-foreground tabular-nums"
          />{" "}
          h
        </label>
        <button
          type="submit"
          disabled={savingInterval}
          className="h-8 rounded-full border border-border px-3 font-medium text-foreground hover:bg-foreground/10 disabled:opacity-50"
        >
          {savingInterval ? "Saving…" : "Save"}
        </button>
      </form>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="h-9 touch-manipulation rounded-full border border-border px-4 text-[13px] font-medium text-foreground outline-hidden transition-[scale,background-color] duration-150 ease-out select-none hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[background-color]"
        >
          {expanded ? "Hide history and log" : "History and log"}
        </button>
        <button
          type="button"
          onClick={rescrape}
          disabled={rescraping}
          className="h-9 touch-manipulation rounded-full bg-foreground px-4 text-[13px] font-medium text-background outline-hidden transition-[scale,opacity] duration-150 ease-out select-none hover:opacity-90 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[opacity] disabled:opacity-50"
        >
          {rescraping ? "Scraping…" : "Scrape now"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirmUntrack) {
              setConfirmUntrack(false);
              void onUntracked(target.id);
            } else {
              setConfirmUntrack(true);
            }
          }}
          aria-live="polite"
          className="ml-auto h-9 touch-manipulation rounded-full px-4 text-[13px] font-medium text-danger outline-hidden transition-[scale,background-color] duration-150 ease-out select-none hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[background-color]"
        >
          {confirmUntrack ? "Confirm untrack?" : "Untrack"}
        </button>
      </div>

      {detailError && <p className="mt-3 text-sm text-danger">{detailError}</p>}

      {expanded && (
        <div className="mt-2">
          <h4 className="mt-5 mb-2 text-sm font-semibold text-foreground">Price history</h4>
          {history === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted">No validated observations yet.</p>
          ) : (
            <div className="overflow-x-auto">
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

          <h4 className="mt-5 mb-2 text-sm font-semibold text-foreground">Scrape log</h4>
          {log === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : log.length === 0 ? (
            <p className="text-sm text-muted">No attempts recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
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
        </div>
      )}
    </article>
  );
}
