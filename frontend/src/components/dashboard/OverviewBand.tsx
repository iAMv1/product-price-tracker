import { useState } from "react";
import { RelativeTime } from "../ui/relative-time";
import { SectionTitle } from "../site-nav";
import { StatCounter, type Stat } from "../ui/stat-counter";
import { cn } from "../../lib/cn";
import type { RunEntry } from "../../services/api";

// Counts are integers, so the format pins zero fraction digits: during the
// count-up the figure steps 1 → 2 → 3 instead of passing through "2.87",
// which would show a fraction of a product that does not exist.
const count = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * The overview band: four figures, each derived from real API data.
 *
 * A sparkline is drawn ONLY where we have a genuine series behind it. The
 * runs feed gives us a real per-run failure history, so that figure gets a
 * line that means something. Tracked count and price-drop count have no
 * history we can substantiate, so they render as plain counts with no trend
 * line — we never draw a curve we cannot back up.
 */
export function OverviewBand({
  trackedCount,
  drops,
  failures,
  runs,
}: {
  trackedCount: number;
  drops: number;
  failures: number;
  runs: RunEntry[];
}) {
  // Oldest first, so the line reads left-to-right in time order.
  const chronological = [...runs].reverse();
  const failureSeries = chronological.map((r) => r.failureCount);

  const stats: Stat[] = [
    { label: "Products tracked", value: trackedCount, format: count },
    { label: "Price drops found", value: drops, format: count },
    {
      label: "Checks that failed",
      value: failures,
      format: count,
      // A rising failure count is bad news, so this line reads danger-coloured.
      goodWhen: "down",
      ...(failureSeries.length > 1 ? { series: failureSeries } : {}),
    },
    { label: "Recent runs", value: runs.length, format: count },
  ];

  return (
    <section aria-label="Overview">
      <SectionTitle
        right={
          <span className="text-[13px] text-muted">
            checked every 2 hours
          </span>
        }
      >
        Overview
      </SectionTitle>
      <StatCounter stats={stats} className="mt-3" />
      {failures > 0 && (
        <p className="mt-3 text-[13px] text-muted">
          <span className="font-medium text-foreground">{failures}</span>{" "}
          {failures === 1 ? "check has" : "checks have"} failed. The last
          known price for each is kept, not overwritten.
        </p>
      )}
    </section>
  );
}

/** Quiet strip of recent runs. Evidence, not notification. */
export function RunsStrip({ runs }: { runs: RunEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  if (runs.length === 0) return null;
  // Law 5: show ≤7 pills at a glance; the rest waits behind an explicit toggle.
  const visible = showAll ? runs.slice(0, 12) : runs.slice(0, 4);
  const hidden = Math.max(0, runs.length - visible.length);
  return (
    <section aria-label="Recent runs" className="mt-8">
      <SectionTitle
        right={
          <span className="text-[13px] text-muted">every 2 hours</span>
        }
      >
        Recent runs
      </SectionTitle>
      <ol className="mt-3 flex flex-wrap gap-2">
        {visible.map((run) => (
          <li
            key={run.id}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]",
              run.failureCount > 0 ? "border-danger bg-background" : "border-border bg-background",
            )}
            title={`${run.triggerType} · ${run.targetCount} targets`}
          >
            <RelativeTime date={run.startedAt} />
            <span className="text-muted">{run.triggerType}</span>
            <span className="font-data font-medium text-foreground">
              {run.successCount} ok
              {run.failureCount > 0 ? ` · ${run.failureCount} failed` : ""}
            </span>
          </li>
        ))}
        {!showAll && hidden > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex shrink-0 items-center rounded-full border border-border bg-background px-3 py-1.5 text-[13px] text-muted transition-colors hover:text-foreground"
            >
              +{hidden} earlier
            </button>
          </li>
        )}
        {showAll && runs.length > 4 && (
          <li>
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="flex shrink-0 items-center rounded-full border border-border bg-background px-3 py-1.5 text-[13px] text-muted transition-colors hover:text-foreground"
            >
              Show fewer
            </button>
          </li>
        )}
      </ol>
    </section>
  );
}