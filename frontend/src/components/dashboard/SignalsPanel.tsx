import { RelativeTime } from "../ui/relative-time";
import { SectionTitle } from "../site-nav";
import { cn } from "../../lib/cn";
import type { AlertItem, ChangeEvent } from "../../services/api";

/**
 * Alerts and storefront-change events.
 *
 * Two rules:
 * 1. When both feeds are empty this renders NOTHING. An empty box would take
 *    attention it has not earned, and these are bonus signals — they must
 *    never make the dashboard feel like it is waiting on something.
 * 2. A raw backend code may be SHOWN, but never on its own: it is always
 *    paired with a plain-English label. `handshake_drift` means nothing to a
 *    reader, so it renders as "page structure changed" with the code beside
 *    it for anyone who wants the exact value.
 */
export function SignalsPanel({
  alerts,
  changes,
}: {
  alerts: AlertItem[];
  changes: ChangeEvent[];
}) {
  if (alerts.length === 0 && changes.length === 0) return null;
  return (
    <>
      {alerts.length > 0 && (
        <section aria-label="Alerts" className="mt-8">
          <SectionTitle
            right={
              <span className="font-data text-[13px] text-muted tabular-nums">
                {alerts.length}
              </span>
            }
          >
            Alerts
          </SectionTitle>
          <ul className="mt-3 flex flex-col gap-2">
            {alerts.slice(0, 6).map((alert) => (
              <li key={`${alert.type}-${alert.trackedProductId}`}>
                <AlertRow alert={alert} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {changes.length > 0 && (
        <section aria-label="Storefront changes" className="mt-8">
          <SectionTitle
            right={
              <span className="font-data text-[13px] text-muted tabular-nums">
                {changes.length}
              </span>
            }
          >
            Storefront changes
          </SectionTitle>
          <p className="mt-2 text-[13px] text-muted">
            The store&rsquo;s page structure looks different from when this was
            last checked, so prices may be missing until it settles.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {changes.slice(0, 4).map((change) => (
              <li
                key={`${change.store_product_id}-${change.attempted_at}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-danger bg-background px-4 py-3"
              >
                <span className="text-[15px] font-medium text-foreground">
                  {change.product_name}
                </span>
                <span className="font-data text-[13px] text-muted">
                  {change.selected_option}
                </span>
                <span className="text-[13px] text-danger">
                  page structure changed
                </span>
                <span className="font-data text-[13px] text-muted">
                  {change.error_code}
                </span>
                <span className="ml-auto text-[13px] text-muted">
                  <RelativeTime date={change.attempted_at} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function AlertRow({ alert }: { alert: AlertItem }) {
  const base =
    "flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border bg-background px-4 py-3";
  if (alert.type === "price_drop") {
    return (
      <div className={cn(base, "border-border")}>
        <span className="text-[15px] font-medium text-foreground">
          {alert.productName}
        </span>
        <span className="font-data text-[13px] text-muted">
          {alert.selectedOption}
        </span>
        <span className="font-data text-[13px] text-danger">
          {alert.dropPct?.toFixed(1)}% lower
        </span>
        {alert.observedAt && (
          <span className="ml-auto text-[13px] text-muted">
            <RelativeTime date={alert.observedAt} />
          </span>
        )}
      </div>
    );
  }
  if (alert.type === "back_in_stock") {
    return (
      <div className={cn(base, "border-border")}>
        <span className="text-[15px] font-medium text-foreground">
          {alert.productName}
        </span>
        <span className="text-[13px] text-muted">back in stock</span>
        {alert.observedAt && (
          <span className="ml-auto text-[13px] text-muted">
            <RelativeTime date={alert.observedAt} />
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={cn(base, "border-danger")}>
      <span className="text-[15px] font-medium text-foreground">
        {alert.productName}
      </span>
      <span className="text-[13px] text-danger">last check failed</span>
      {alert.errorCode && (
        <span className="font-data text-[13px] text-muted">
          {alert.errorCode}
        </span>
      )}
      {alert.attemptedAt && (
        <span className="ml-auto text-[13px] text-muted">
          <RelativeTime date={alert.attemptedAt} />
        </span>
      )}
    </div>
  );
}