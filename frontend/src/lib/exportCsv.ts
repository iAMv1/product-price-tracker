import type { AttemptEntry, TrackedTarget } from "../services/api";

/**
 * Per-product CSV export. The server exports all products only, so a single
 * product file is generated locally from the loaded attempt log. The column
 * order, empty non-success cells, and formula-injection guard match
 * GET /api/export.csv.
 */
const HEADER =
  "product_id,product_name,selected_option,timestamp,price,stock,outcome,attempt_number";

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildProductCsv(
  target: Pick<TrackedTarget, "storeProductId" | "productName" | "selectedOption">,
  log: AttemptEntry[],
): string {
  const rows = log
    .slice()
    .sort((a, b) => {
      if (a.attempted_at === b.attempted_at) {
        return a.attempt_number - b.attempt_number;
      }
      return a.attempted_at < b.attempted_at ? -1 : 1;
    })
    .map((entry) =>
      [
        cell(target.storeProductId),
        cell(target.productName),
        cell(target.selectedOption),
        cell(entry.attempted_at),
        cell(entry.price),
        cell(entry.stock),
        cell(entry.outcome),
        cell(entry.attempt_number),
      ].join(","),
    );
  return [HEADER, ...rows].join("\n") + "\n";
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
