import { useEffect, useId, useState } from "react";
import { buildProductCsv, downloadCsv } from "../../lib/exportCsv";
import {
  exportCsvUrl,
  fetchScrapeLog,
  type TrackedTarget,
} from "../../services/api";
import { Modal } from "./Modal";
import { PrimaryButton, SecondaryButton, inputClassName } from "./controls";

/**
 * Export dialog from the wireframes. Unsupported server filters stay visible
 * but disabled; only real behavior can be submitted.
 */
export function ExportDialog({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target?: TrackedTarget | null;
}) {
  const titleId = useId();
  const [scope, setScope] = useState<"product" | "all">(target ? "product" : "all");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setScope(target ? "product" : "all");
      setWorking(false);
      setError(null);
      setDone(null);
    }
  }, [open, target]);

  async function submit() {
    setWorking(true);
    setError(null);
    setDone(null);
    try {
      if (scope === "product" && target) {
        const log = await fetchScrapeLog(target.id, 200);
        downloadCsv(
          `product-${target.storeProductId}-scrape-history.csv`,
          buildProductCsv(target, log),
        );
        setDone(
          log.length >= 200
            ? "Downloaded this product’s latest 200 attempts."
            : `Downloaded this product’s ${log.length} attempts.`,
        );
      } else {
        const response = await fetch(exportCsvUrl());
        if (!response.ok) {
          throw new Error(`export failed with HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "scrape-history.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        setDone("Downloaded the server-generated full history.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Export failed");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="text-lg font-semibold tracking-tight text-foreground">
        Export scrape history
      </h2>
      <p className="mt-1 text-sm text-muted">
        One row per attempt. Failed and retried rows leave price and stock empty.
      </p>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-foreground">Scope</legend>
        <div className="mt-2 grid gap-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-60">
            <input
              type="radio"
              name="export-scope"
              value="product"
              checked={scope === "product"}
              disabled={!target}
              onChange={() => setScope("product")}
              className="size-4 accent-[#1d4ed8]"
            />
            This product only
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <input
              type="radio"
              name="export-scope"
              value="all"
              checked={scope === "all"}
              onChange={() => setScope("all")}
              className="size-4 accent-[#1d4ed8]"
            />
            All tracked products
          </label>
        </div>
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-foreground">
          Date range
          <select disabled value="all" className={`${inputClassName} mt-2`} aria-describedby={`${titleId}-range`}>
            <option value="all">All time</option>
          </select>
          <span id={`${titleId}-range`} className="mt-2 block text-[13px] font-normal text-muted">
            Date filtering is unavailable because the export API has no date filter.
          </span>
        </label>
        <div className="text-sm font-medium text-foreground">
          Attempts
          <label className="mt-2 flex cursor-not-allowed items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-normal">
            <input type="checkbox" checked disabled className="size-4" />
            Include failed attempts
          </label>
          <span className="mt-2 block text-[13px] font-normal text-muted">
            The export format always includes success, retried, and failed attempts.
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-4 text-sm text-success">
          {done}
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <SecondaryButton onClick={onClose} disabled={working}>
          Cancel
        </SecondaryButton>
        <PrimaryButton onClick={() => void submit()} disabled={working}>
          {working ? "Preparing…" : "Export CSV"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}
