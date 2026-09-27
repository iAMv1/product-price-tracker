import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ExportDialog } from "./ExportDialog";
import { ManualScrapeDialog } from "./ManualScrapeDialog";
import { MiniTrend } from "./MiniTrend";
import { QuickViewModal } from "./QuickViewModal";
import { Card, ProductMark } from "./primitives";
import { OutcomeBadge, StockBadge } from "./status";
import { DropdownMenu } from "../ui/dropdown-menu";
import { Bone } from "../ui/skeleton-loader";
import { ContextMenuArea, type MenuItem } from "../ui/context-menu";
import { RelativeTime } from "../ui/relative-time";
import { goHash, trackedHref } from "../../router";
import { formatRupees } from "../../lib/format";
import { fetchHistory, type TrackedTarget } from "../../services/api";

/** Dashboard row from the wireframes: identity, price, status, trend, actions.
 *
 * Pointer-only shortcut: the whole card previews on click. Keyboard and
 * screen-reader users get the same action through the name and monogram
 * buttons, so the card itself stays unfocusable with no extra tab stop. */
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

  // One action list drives BOTH menus: the visible ⋯ button (touch and
  // keyboard users) and the right-click/long-press context menu (pointer
  // users). They can never disagree about what a row can do.
  const menuIcon = (d: string) => (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
  const menuItems: MenuItem[] = [
    { label: "View details", icon: menuIcon("M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4Z M8 6.25a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Z") },
    { label: "Run manual scrape", icon: menuIcon("M8.75 1.75 4 9h3l-1 5.25L11.5 7h-3l.25-5.25Z") },
    { label: "Edit settings", icon: menuIcon("M8 5.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z M8 1.5v1.75M8 12.75v1.75M1.5 8h1.75M12.75 8h1.75M3.4 3.4l1.25 1.25M11.35 11.35l1.25 1.25M12.6 3.4l-1.25 1.25M4.65 11.35l-1.25 1.25") },
    { label: "View scrape log", icon: menuIcon("M5.5 4.5h8M5.5 8h8M5.5 11.5h8M2.5 4.5h.01M2.5 8h.01M2.5 11.5h.01") },
    { label: "Download CSV", icon: menuIcon("M8 2v8M4.5 7 8 10.5 11.5 7M3 13.5h10") },
    {
      label: "Remove",
      icon: menuIcon("M2.5 4h11M6 4V2.5h4V4M4 4l.5 8.5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1L12 4M6.5 7v3.5M9.5 7v3.5"),
      destructive: true,
      separated: true,
    },
  ];

  return (
    <Card
      className="cursor-pointer p-4 transition-colors hover:border-foreground/30 sm:p-5"
      onClick={(e: React.MouseEvent) => {
        const el = e.target as HTMLElement;
        // Dialogs render inline inside the card: a backdrop click must only
        // dismiss the dialog, never re-trigger preview underneath it. Menu
        // items are divs, not buttons, so they need their own carve-out.
        if (el.closest('[role="dialog"], [role="menuitem"]')) return;
        if (el.closest("button, a")) return;
        setQuickOpen(true);
      }}
    >
      <ContextMenuArea
        items={menuItems}
        onSelect={(item) => select(item.label)}
        label={`Actions for ${target.productName}`}
        tabbable={false}
      >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            aria-label={`Quick view ${target.productName}`}
            className="shrink-0 rounded-xl outline-hidden transition-[scale] duration-150 ease-out hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] motion-reduce:transition-none"
          >
            <ProductMark name={target.productName} />
          </button>
          <div className="min-w-0">
            {/* Name opens the quick view: preview on the monitoring surface,
                full workspace one more click away. */}
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="block max-w-full truncate text-left text-base font-semibold text-foreground outline-hidden hover:text-primary hover:underline hover:decoration-primary/40 hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-primary"
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
            <p className="text-xl font-semibold tracking-tight tabular-nums">
              {target.latest ? formatRupees(target.latest.price) : "No price yet"}
            </p>
            {change !== null && (
              <p
                className={`text-[13px] font-semibold tabular-nums ${
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
          <div className="flex flex-wrap items-center gap-2">
            <StockBadge stock={target.latest?.stock} />
            {target.lastScrape && <OutcomeBadge outcome={target.lastScrape.outcome} />}
          </div>
          {values === null ? (
            <div role="status" aria-busy="true">
              <Bone className="h-9 w-[120px] rounded" />
              <span className="sr-only">Loading trend…</span>
            </div>
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
      </ContextMenuArea>

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
