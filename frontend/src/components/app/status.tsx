import { cn } from "../../lib/cn";

type Tone = "success" | "danger" | "warning" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  danger: "border-danger/30 bg-danger/10 text-danger",
  warning: "border-alert/40 bg-alert/10 text-alert-fg",
  info: "border-primary/30 bg-primary/10 text-primary",
  neutral: "border-border bg-surface text-muted",
};

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap",
        TONES[tone],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

/** Stock availability derived only from the latest validated observation. */
export function StockBadge({ stock }: { stock: string | null | undefined }) {
  const raw = stock?.trim() ?? "";
  if (/^\d+$/.test(raw)) {
    const quantity = Number(raw);
    if (quantity === 0) return <Badge tone="danger">Out of stock</Badge>;
    return (
      <span title={`Latest validated stock: ${raw}`}>
        <Badge tone="success">In stock</Badge>
      </span>
    );
  }
  if (raw === "") return <Badge tone="neutral">Stock unknown</Badge>;
  return (
    <span title={`Latest validated stock: ${raw}`}>
      <Badge tone="neutral">Stock {raw}</Badge>
    </span>
  );
}

/** Scrape/run outcomes use one semantic color each. */
export function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "success" || outcome === "completed") {
    return <Badge tone="success">{outcome === "completed" ? "Completed" : "Success"}</Badge>;
  }
  if (outcome === "failed") return <Badge tone="danger">Failed</Badge>;
  if (outcome === "retried" || outcome === "abandoned") {
    return <Badge tone="warning">{outcome === "abandoned" ? "Abandoned" : "Retried"}</Badge>;
  }
  if (outcome === "running" || outcome === "queued" || outcome === "scheduled") {
    const label = outcome.charAt(0).toUpperCase() + outcome.slice(1);
    return <Badge tone="info">{label}</Badge>;
  }
  return <Badge tone="neutral">Check completed</Badge>;
}

/** Computed alerts use shopper-meaningful colors: drops are good news. */
export function AlertBadge({ type }: { type: string }) {
  if (type === "price_drop") return <Badge tone="success">Price drop</Badge>;
  if (type === "back_in_stock") return <Badge tone="success">Back in stock</Badge>;
  return <Badge tone="danger">Check failed</Badge>;
}
