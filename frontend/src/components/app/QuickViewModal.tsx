import { useId } from "react";
import { Modal } from "./Modal";
import { MiniTrend } from "./MiniTrend";
import { Eyebrow, ProductMark } from "./primitives";
import { OutcomeBadge, StockBadge } from "./status";
import { RelativeTime } from "../ui/relative-time";
import { formatRupees, nextScrapeIn } from "../../lib/format";
import { trackedHref } from "../../router";
import type { TrackedTarget } from "../../services/api";

/**
 * Dashboard quick view: clicking a product name previews it in place instead
 * of navigating away. Reason: the dashboard is a monitoring surface — preview
 * first, full workspace on demand. Deep links (log/settings tabs) stay one
 * click away inside the modal, and the ⋯ menu keeps scrape/export/remove.
 */
export function QuickViewModal({
  open,
  target,
  values,
  onClose,
}: {
  open: boolean;
  target: TrackedTarget;
  values: number[] | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const change =
    values && values.length > 1 && values[0] !== 0
      ? ((values[values.length - 1]! - values[0]!) / values[0]!) * 100
      : null;

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId} className="max-w-xl">
      <div className="flex items-start gap-4">
        <ProductMark name={target.productName} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-xl font-semibold tracking-tight">
            {target.productName}
          </h2>
          <p className="mt-0.5 truncate text-sm text-muted tabular-nums">
            {target.selectedOption} · ID {target.storeProductId}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quick view"
          className="grid size-9 shrink-0 place-items-center rounded-full text-lg text-muted outline-hidden hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary"
        >
          <span aria-hidden>×</span>
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <p className="text-3xl font-semibold tabular-nums">
          {target.latest ? formatRupees(target.latest.price) : "No price yet"}
        </p>
        {change !== null && (
          <p
            className={`text-sm font-semibold tabular-nums ${
              change < 0 ? "text-success" : change > 0 ? "text-danger" : "text-muted"
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
            {Math.abs(change).toFixed(1)}%
          </p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StockBadge stock={target.latest?.stock} />
        {target.lastScrape && <OutcomeBadge outcome={target.lastScrape.outcome} />}
      </div>

      {values !== null && values.length > 1 && (
        <div className="mt-4">
          <MiniTrend values={values} />
        </div>
      )}

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
        <div>
          <dt className="text-xs font-medium text-muted">Last scraped</dt>
          <dd className="mt-0.5 font-semibold">
            {target.lastScrape ? <RelativeTime date={target.lastScrape.attemptedAt} /> : "never"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">Next scrape</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {nextScrapeIn(target.lastScrape?.attemptedAt, target.scrapeIntervalHours)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">Interval</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            every {target.scrapeIntervalHours ?? 2} h
          </dd>
        </div>
      </dl>

      {target.lastScrape?.outcome === "failed" && (
        <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          Latest scrape failed. Showing the last validated observation, not fresh data.
        </p>
      )}

      <div className="mt-5">
        <Eyebrow>Open</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={trackedHref(target.id)}
            onClick={onClose}
            className="inline-flex min-h-10 items-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90"
          >
            Full details →
          </a>
          <a
            href={trackedHref(target.id, "history")}
            onClick={onClose}
            className="inline-flex min-h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-foreground/40"
          >
            Price history
          </a>
          <a
            href={trackedHref(target.id, "log")}
            onClick={onClose}
            className="inline-flex min-h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-foreground/40"
          >
            Scrape log
          </a>
          <a
            href={trackedHref(target.id, "settings")}
            onClick={onClose}
            className="inline-flex min-h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-foreground/40"
          >
            Settings
          </a>
        </div>
      </div>
    </Modal>
  );
}
