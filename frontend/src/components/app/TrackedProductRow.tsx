import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ExportDialog } from "./ExportDialog";
import { ManualScrapeDialog } from "./ManualScrapeDialog";
import { MiniTrend } from "./MiniTrend";
import { QuickViewModal } from "./QuickViewModal";
import { Card, ProductMark } from "./primitives";
import { OutcomeBadge, StockBadge } from "./status";
import { DropdownMenu } from "../ui/dropdown-menu";
import { RelativeTime } from "../ui/relative-time";
import { goHash, trackedHref } from "../../router";
import { formatRupees } from "../../lib/format";
import { fetchHistory, type TrackedTarget } from "../../services/api";

/** Dashboard row from the wireframes: identity, price, status, trend, actions. */
export function TrackedProductRow({
  target,
  onChanged,
  onUntracked,
}: {
  target: TrackedTarget;
  onChanged: () => Promise<void>;
  onUntracked: (id: string) => Promise<void>;
}) {
  const [values, setValues] = useState<number[] | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchHistory(target.id, 30)
      .then((history) => {
        if (cancelled) return;
        setValues(history.slice().reverse().map((entry) => entry.price));
      })
      .catch(() => {
        if (!cancelled) setValues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [target.id, target.latest?.observedAt]);

  const change =
    values && values.length > 1 && values[0] !== 0
      ? ((values[values.length - 1]! - values[0]!) / values[0]!) * 100
      : null;

  function select(action: string) {
    if (action === "View details") goHash(trackedHref(target.id));
    else if (action === "Run manual scrape") setManualOpen(true);
    else if (action === "Edit settings") goHash(trackedHref(target.id, "settings"));
    else if (action === "View scrape log") goHash(trackedHref(target.id, "log"));
    else if (action === "Download CSV") setExportOpen(true);
    else if (action === "Remove") setRemoveOpen(true);
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <ProductMark name={target.productName} />
          <div className="min-w-0">
            {/* Name opens the quick view: preview on the monitoring surface,
                full workspace one more click away. */}
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="block max-w-full truncate text-left text-[15px] font-semibold text-foreground outline-hidden hover:text-primary hover:underline hover:decoration-primary/40 hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {target.productName}
            </button>
            <p className="mt-0.5 truncate text-[13px] text-muted tabular-nums">
              {target.selectedOption} · ID {target.storeProductId}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              Last scraped:{" "}
              {target.lastScrape ? <RelativeTime date={target.lastScrape.attemptedAt} /> : "never"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:ml-auto">
          <div className="min-w-[120px]">
            <p className="text-lg font-semibold tabular-nums">
              {target.latest ? formatRupees(target.latest.price) : "No price yet"}
            </p>
            {change !== null && (
              <p
                className={`text-[13px] font-semibold tabular-nums ${
                  change < 0 ? "text-success" : change > 0 ? "text-danger" : "text-muted"
                }`}
              >
                {change < 0 ? "▼" : change > 0 ? "▲" : "•"} {Math.abs(change).toFixed(1)}%
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StockBadge stock={target.latest?.stock} />
            {target.lastScrape && <OutcomeBadge outcome={target.lastScrape.outcome} />}
          </div>
          {values === null ? (
            <p className="text-[13px] text-muted" role="status">
              Loading trend…
            </p>
          ) : values.length > 1 ? (
            <MiniTrend values={values} />
          ) : (
            <p className="w-[120px] text-[13px] text-muted">Not enough checks for a trend.</p>
          )}
          <DropdownMenu
            label={
              <>
                <span aria-hidden>⋯</span>
                <span className="sr-only">Actions for {target.productName}</span>
              </>
            }
            align="end"
            chevron={false}
            items={[
              { label: "View details" },
              { label: "Run manual scrape" },
              { label: "Edit settings" },
              { label: "View scrape log" },
              { label: "Download CSV" },
              { type: "separator" },
              { label: "Remove", destructive: true },
            ]}
            onSelect={select}
          />
        </div>
      </div>

      {target.lastScrape?.outcome === "failed" && (
        <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
          Latest scrape failed. Showing the last validated observation, not fresh data.
        </p>
      )}

      <ManualScrapeDialog
        open={manualOpen}
        targetId={target.id}
        productName={target.productName}
        onClose={() => setManualOpen(false)}
        onFinished={() => void onChanged()}
      />
      <QuickViewModal
        open={quickOpen}
        target={target}
        values={values}
        onClose={() => setQuickOpen(false)}
      />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} target={target} />
      <ConfirmDialog
        open={removeOpen}
        title="Remove this product?"
        body="It will leave the dashboard, but its attempts and validated history stay in exports."
        confirmLabel="Remove"
        busy={removing}
        onCancel={() => setRemoveOpen(false)}
        onConfirm={() => {
          // Confirmed removal: the row stays until the server answers 204.
          // A failure leaves the row in place; the dashboard shows why.
          void (async () => {
            setRemoving(true);
            try {
              await onUntracked(target.id);
              setRemoveOpen(false);
            } catch {
              setRemoveOpen(false);
            } finally {
              setRemoving(false);
            }
          })();
        }}
      />
    </Card>
  );
}
