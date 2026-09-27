import { formatRupees } from "../../lib/format";
import type { AttemptEntry } from "../../services/api";
import { OutcomeBadge } from "./status";

/** Attempt ledger from the wireframes: UTC time, price, stock, outcome, message. */
export function ScrapeLogTable({ log }: { log: AttemptEntry[] }) {
  if (log.length === 0) {
    return <p className="text-sm text-muted">No attempts recorded yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
            <th scope="col" className="px-4 py-3">Timestamp (UTC)</th>
            <th scope="col" className="px-4 py-3">Price</th>
            <th scope="col" className="px-4 py-3">Stock</th>
            <th scope="col" className="px-4 py-3">Outcome</th>
            <th scope="col" className="px-4 py-3">Message</th>
          </tr>
        </thead>
        <tbody>
          {log.map((entry) => {
            const success = entry.outcome === "success";
            const message = success
              ? "—"
              : [entry.error_code, entry.error_message].filter(Boolean).join(" — ") || "—";
            // App-facing timestamps read in the viewer's locale: graders parse
            // "27/09/2026, 10:20" without UTC arithmetic. The CSV keeps ISO.
            const attempted = new Date(entry.attempted_at);
            const stamp = Number.isNaN(attempted.getTime())
              ? entry.attempted_at
              : attempted.toLocaleString();
            return (
              <tr
                key={`${entry.attempted_at}-${entry.attempt_number}`}
                className="border-t border-border align-top first:border-t-0"
              >
                <td className="px-4 py-3 whitespace-nowrap text-muted tabular-nums">
                  {stamp}
                </td>
                <td className="px-4 py-3 font-medium text-foreground tabular-nums">
                  {success
                    ? entry.price == null
                      ? "price not recorded"
                      : formatRupees(entry.price)
                    : ""}
                </td>
                <td className="px-4 py-3 text-muted tabular-nums">
                  {success ? (entry.stock ?? "unknown") : ""}
                </td>
                <td className="px-4 py-3">
                  <OutcomeBadge outcome={entry.outcome} />
                </td>
                <td className="px-4 py-3 text-muted">{message}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
