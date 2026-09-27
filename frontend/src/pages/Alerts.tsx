import { useEffect, useState } from "react";
import { AppShell } from "../components/app/AppShell";
import { Card, Eyebrow } from "../components/app/primitives";
import { SecondaryButton } from "../components/app/controls";
import { AlertBadge } from "../components/app/status";
import { RelativeTime } from "../components/ui/relative-time";
import { productHref, trackedHref } from "../router";
import {
  fetchAlerts,
  fetchChangeEvents,
  type AlertItem,
  type ChangeEvent,
} from "../services/api";

/** Alerts workspace: computed price, stock, failure, and storefront signals. */
export default function Alerts() {
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const [changes, setChanges] = useState<ChangeEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [alertItems, changeItems] = await Promise.all([
          fetchAlerts(),
          fetchChangeEvents(),
        ]);
        if (cancelled) return;
        setAlerts(alertItems);
        setChanges(changeItems);
        setError(null);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load alerts");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups: Array<{ id: string; title: string; items: AlertItem[] }> = [
    {
      id: "price",
      title: "Price drops",
      items: (alerts ?? []).filter((alert) => alert.type === "price_drop"),
    },
    {
      id: "stock",
      title: "Back in stock",
      items: (alerts ?? []).filter((alert) => alert.type === "back_in_stock"),
    },
    {
      id: "failed",
      title: "Failed checks",
      items: (alerts ?? []).filter((alert) => alert.type === "scrape_failed"),
    },
  ];

  return (
    <AppShell
      active="alerts"
      title="Alerts"
      description="Price drops, restocks, failed checks, and storefront changes from validated observations."
      actions={
        <SecondaryButton onClick={() => (window.location.hash = "#/settings")}>
          Notification settings
        </SecondaryButton>
      }
    >
      {error && (
        <p role="alert" className="mb-6 text-sm text-danger">
          {error}
        </p>
      )}
      {alerts === null || changes === null ? (
        <p role="status" className="text-sm text-muted">
          Loading alerts…
        </p>
      ) : (
        <div className="grid gap-6">
          {groups.map((group) => (
            <Card key={group.id}>
              <div className="flex items-center justify-between gap-3">
                <Eyebrow>{group.title}</Eyebrow>
                <span className="text-[13px] text-muted tabular-nums">{group.items.length}</span>
              </div>
              {group.items.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No {group.title.toLowerCase()} right now.</p>
              ) : (
                <ul className="mt-3 grid gap-2">
                  {group.items.map((alert) => (
                    <li
                      key={`${alert.type}-${alert.trackedProductId}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border px-4 py-3"
                    >
                      <AlertBadge type={alert.type} />
                      <a
                        href={trackedHref(alert.trackedProductId)}
                        className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-primary"
                      >
                        {alert.productName} · {alert.selectedOption}
                      </a>
                      <span className="text-[13px] text-muted tabular-nums">
                        {alertDetail(alert)}
                      </span>
                      <span className="text-[13px] text-muted">
                        <RelativeTime date={alert.observedAt ?? alert.attemptedAt ?? ""} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}

          <Card>
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>Storefront changes</Eyebrow>
              <span className="text-[13px] text-muted tabular-nums">{changes.length}</span>
            </div>
            <p className="mt-2 text-[13px] text-muted">
              The store’s page structure looked different during these checks, so prices may be
              missing until it settles.
            </p>
            {changes.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No structural changes detected.</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {changes.slice(0, 10).map((change) => (
                  <li
                    key={`${change.store_product_id}-${change.attempted_at}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-danger/30 px-4 py-3"
                  >
                    <a
                      href={productHref(change.store_product_id)}
                      className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-primary"
                    >
                      {change.product_name} · {change.selected_option}
                    </a>
                    <span className="text-[13px] font-medium text-danger">
                      page structure changed
                    </span>
                    <span className="text-[13px] text-muted tabular-nums">{change.error_code}</span>
                    <span className="text-[13px] text-muted">
                      <RelativeTime date={change.attempted_at} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function alertDetail(alert: AlertItem): string {
  if (alert.type === "price_drop") {
    return `${alert.dropPct ?? "?"}% lower`;
  }
  if (alert.type === "back_in_stock") {
    return alert.stock ? `stock ${alert.stock}` : "back in stock";
  }
  return alert.errorCode ?? "failed";
}
