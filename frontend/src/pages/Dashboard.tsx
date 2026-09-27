import { useState } from "react";
import { AppShell } from "../components/app/AppShell";
import { CountUp } from "../components/app/CountUp";
import { RunTimeline } from "../components/app/RunTimeline";
import { ExportDialog } from "../components/app/ExportDialog";
import { Card, Eyebrow } from "../components/app/primitives";
import { PrimaryButton, SecondaryButton } from "../components/app/controls";
import { TrackedProductRow } from "../components/app/TrackedProductRow";
import { TargetCardSkeleton } from "../components/ui/skeleton-loader";
import { Countdown } from "../components/ui/countdown";
import { LiveIndicator, useWorkIndicator } from "../components/ui/live-indicator";
import { useDashboardData } from "../hooks/useDashboardData";
import { goHash } from "../router";
import type { HealthResponse } from "../services/api";

/**
 * Dashboard from the wireframes: stat tiles, tracked-product rows, and recent
 * runs. Search lives on its own page; Add Product routes there.
 */
function describeDatabase(health: HealthResponse): string {
  const probe = health.database;
  const configured = health.integrations.database;
  if (probe === "reachable") return "reachable";
  if (probe === "not_configured") return "not configured";
  if (probe === "unreachable") return configured ? "configured, unreachable" : "unreachable";
  return configured ? "configured" : "not configured";
}

export default function Dashboard() {
  const { boot, retryBoot, targets, targetsError, alerts, runs, feedOk, refresh, refreshFeed, untrack } =
    useDashboardData();
  const [exportOpen, setExportOpen] = useState(false);
  const work = useWorkIndicator({
    scraping: false,
    reachable: boot.kind === "ready",
    connecting: boot.kind === "loading",
  });

  const priceDrops = alerts.filter((alert) => alert.type === "price_drop").length;
  const failures = alerts.filter((alert) => alert.type === "scrape_failed").length;
  // A failed optional feed renders as unavailable, never as a confident zero.
  const stats = [
    { label: "Tracked products", value: targets.length as number | null, note: "Active targets" },
    {
      label: "Price drops",
      value: feedOk.alerts ? (priceDrops as number | null) : null,
      note: feedOk.alerts ? "From validated checks" : "Alerts unavailable",
    },
    {
      label: "Failed checks",
      value: feedOk.alerts ? (failures as number | null) : null,
      note: feedOk.alerts ? "Latest failed attempts" : "Alerts unavailable",
    },
    {
      label: "Recent runs",
      value: feedOk.runs ? (runs.length as number | null) : null,
      note: feedOk.runs ? "Latest 10 scheduler runs" : "Run history unavailable",
    },
  ];
  const feedDown = !feedOk.alerts || !feedOk.changes || !feedOk.runs;

  if (boot.kind === "error") {
    return (
      <AppShell active="dashboard" title="Dashboard" description="Monitor your tracked products and price changes.">
        <Card className="text-center">
          <h2 className="text-lg font-semibold">We can&rsquo;t reach the tracker</h2>
          <p className="mx-auto mt-2 max-w-[52ch] text-sm text-muted">
            Nothing is lost — tracked products are stored on the server. {boot.message}
          </p>
          <div className="mt-4">
            <PrimaryButton onClick={() => void retryBoot()}>Try again</PrimaryButton>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      active="dashboard"
      title="Dashboard"
      description="Monitor your tracked products and price changes."
      actions={
        <>
          <LiveIndicator tone={work.tone} label={work.label} />
          <SecondaryButton onClick={() => setExportOpen(true)}>Export CSV</SecondaryButton>
          <PrimaryButton onClick={() => goHash("#/search")}>Add Product</PrimaryButton>
        </>
      }
    >
      {boot.kind === "ready" && (
        <p className="mb-6 text-[13px] text-muted tabular-nums">
          backend {boot.health.environment} · database {describeDatabase(boot.health)}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tracking summary">
        {boot.kind === "loading"
          ? [0, 1, 2, 3].map((skeleton) => (
              <Card key={skeleton} className="p-4">
                <div className="h-4 w-24 rounded bg-foreground/10 motion-safe:animate-pulse" />
                <div className="mt-3 h-8 w-16 rounded bg-foreground/10 motion-safe:animate-pulse" />
                <span className="sr-only">Loading summary…</span>
              </Card>
            ))
          : stats.map((stat) => (
              <Card key={stat.label} className="p-4">
                <Eyebrow>{stat.label}</Eyebrow>
                <p className="mt-2 text-[28px] leading-none font-semibold tracking-tight tabular-nums">
                  {stat.value === null ? (
                    <span aria-label={`${stat.label} unavailable`}>—</span>
                  ) : (
                    <CountUp value={stat.value} />
                  )}
                </p>
                <p className="mt-2 text-[13px] text-muted">{stat.note}</p>
              </Card>
            ))}
      </div>

      {feedDown && boot.kind === "ready" && (
        <div
          role="status"
          className="mt-4 rounded-2xl border border-alert/40 bg-alert/10 px-5 py-4"
        >
          <p className="text-sm font-semibold text-alert-fg">Dashboard data partially unavailable</p>
          <ul className="mt-2 grid gap-1 text-sm text-muted">
            <li>{feedOk.alerts ? "✓ Alerts available" : "⚠ Alerts temporarily unavailable"}</li>
            <li>{feedOk.changes ? "✓ Storefront changes available" : "⚠ Storefront changes temporarily unavailable"}</li>
            <li>{feedOk.runs ? "✓ Run history available" : "⚠ Run history temporarily unavailable"}</li>
          </ul>
          <p className="mt-2 text-[13px] text-muted">
            Tracked products above are unaffected — only these secondary feeds failed to load.
          </p>
          <SecondaryButton className="mt-3" onClick={() => void refreshFeed()}>
            Retry secondary data
          </SecondaryButton>
        </div>
      )}

      <section aria-label="Tracked products" className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Tracked Products</h2>
          {targets.length > 0 && (
            <span className="text-[13px] text-muted tabular-nums">{targets.length}</span>
          )}
        </div>
        {targetsError && (
          <div role="alert" className="mb-4 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3">
            <p className="text-sm font-semibold text-danger">{targetsError}</p>
            <SecondaryButton className="mt-3" onClick={() => void refresh()}>
              Retry
            </SecondaryButton>
          </div>
        )}
        {boot.kind === "loading" ? (
          <div className="grid gap-4">
            <TargetCardSkeleton count={2} />
          </div>
        ) : targets.length === 0 && targetsError === null ? (
          <Card className="text-center">
            <h3 className="text-[17px] font-semibold">No tracked products yet</h3>
            <p className="mx-auto mt-2 max-w-[48ch] text-sm text-muted">
              Search for a product to start tracking its price and stock. Checks run
              automatically; failures stay visible.
            </p>
            <div className="mt-4">
              <PrimaryButton onClick={() => goHash("#/search")}>Search Products</PrimaryButton>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4">
            {targets.map((target) => (
              <TrackedProductRow
                key={target.id}
                target={target}
                onChanged={refresh}
                onUntracked={untrack}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Recent runs" className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Recent runs</h2>
        {!feedOk.runs && runs.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Run history unavailable.</p>
        ) : (
          <Card className="mt-3">
            <RunTimeline runs={runs} />
          </Card>
        )}
      </section>

      <footer className="mt-10 border-t border-border pt-6">
        <Countdown className="max-w-md" />
      </footer>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </AppShell>
  );
}
