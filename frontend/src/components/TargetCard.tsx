import { useState } from "react";
import {
  fetchHistory,
  fetchScrapeLog,
  rescrapeTarget,
  type AttemptEntry,
  type HistoryEntry,
  type TrackedTarget,
} from "../services/api";
import { cn } from "../lib/cn";
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
 */
export function TargetCard({
  target,
  onChanged,
  onUntracked,
}: {
  target: TrackedTarget;
  onChanged: () => void;
  onUntracked: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [log, setLog] = useState<AttemptEntry[] | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [rescraping, setRescraping] = useState(false);

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
      onChanged();
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

  const failed = target.lastScrape?.outcome === "failed";
  const points = (history ?? [])
    .slice()
    .reverse()
    .map((h) => ({ label: shortLabel(h.observed_at), value: h.price }));

  return (
    <article
      className={cn(
        "rounded-2xl border bg-surface p-5 shadow-raised",
        failed ? "border-danger" : "border-border",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
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

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <p className="text-[13px] text-muted">Current price</p>
          {target.latest ? (
            <div className="mt-1 flex items-center gap-2">
              <span aria-hidden className="text-2xl font-semibold text-muted">
                ₹
              </span>
              <Odometer value={target.latest.price} />
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">no validated observation yet</p>
          )}
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm">
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
                </>
              ) : (
                "never scraped"
              )}
            </dd>
          </div>
        </dl>
      </div>

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
            format={(v) => `₹${v}`}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="h-9 touch-manipulation rounded-full px-4 text-[13px] font-medium text-foreground outline-hidden transition-[scale,background-color] duration-150 ease-out select-none hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[background-color]"
        >
          {expanded ? "Hide history and log" : "History and log"}
        </button>
        <button
          type="button"
          onClick={rescrape}
          disabled={rescraping}
          className="h-9 touch-manipulation rounded-full px-4 text-[13px] font-medium text-foreground outline-hidden transition-[scale,background-color] duration-150 ease-out select-none hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[background-color] disabled:opacity-50"
        >
          {rescraping ? "Scraping…" : "Scrape now"}
        </button>
        <button
          type="button"
          onClick={() => onUntracked(target.id)}
          className="h-9 touch-manipulation rounded-full px-4 text-[13px] font-medium text-danger outline-hidden transition-[scale,background-color] duration-150 ease-out select-none hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[background-color]"
        >
          Untrack
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
            <table className="w-full text-sm">
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
                      ₹{entry.price}
                    </td>
                    <td className="py-1.5 tabular-nums">{entry.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h4 className="mt-5 mb-2 text-sm font-semibold text-foreground">Scrape log</h4>
          {log === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : log.length === 0 ? (
            <p className="text-sm text-muted">No attempts recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
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
                        ? `₹${entry.price} · ${entry.stock}`
                        : (entry.error_code ?? entry.error_message ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </article>
  );
}
