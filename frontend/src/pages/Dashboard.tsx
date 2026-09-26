import { useCallback, useState } from "react";
import { SiteNav } from "../components/site-nav";
import { OverviewBand, RunsStrip } from "../components/dashboard/OverviewBand";
import { SignalsPanel } from "../components/dashboard/SignalsPanel";
import { TargetsGrid } from "../components/dashboard/TargetsGrid";
import { TrackPanel } from "../components/dashboard/TrackPanel";
import { ExportButton, type ExportStatus } from "../components/ui/export-button";
import { Countdown } from "../components/ui/countdown";
import { LiveIndicator, useWorkIndicator } from "../components/ui/live-indicator";
import { toast } from "../components/ui/toast-stack";
import { useDashboardData } from "../hooks/useDashboardData";
import { useSearchFlow } from "../hooks/useSearchFlow";
import { exportCsvUrl, type HealthResponse } from "../services/api";

/**
 * The dashboard, as composition rather than a state machine.
 *
 * This file used to be 679 lines holding 25 useState hooks: boot, the target
 * list, search, product picking, options, tracking, alerts, change events,
 * runs, export, and the untrack path — all in one component. The reads now
 * live in `useDashboardData` and the find → pick → track flow in
 * `useSearchFlow`; the presentational pieces live in `components/dashboard/`.
 * What remains here is only what genuinely belongs to the page.
 *
 * What did NOT change, and must not:
 * - light/dark mode, via the existing ThemeToggle inside SiteNav
 * - the design tokens; the instrument grid is layered on top of them
 * - every honesty rule: a failure is never hidden, a missing price is stated
 *   in words rather than shown as zero, and no skeleton or progress indicator
 *   ever invents a value
 */
/**
 * Health answers two different questions — is the DB configured, and can it
 * be reached right now — so the status line does too. An older payload
 * without the live probe may only claim configuration, never connection.
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
  const {
    boot,
    retryBoot,
    targets,
    targetsError,
    alerts,
    changes,
    runs,
    refresh,
    untrack,
  } = useDashboardData();

  const flow = useSearchFlow(refresh);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const resetExport = useCallback(() => setExportStatus("idle"), []);

  // The CSV is a real download, so the button only claims "done" after a
  // verified 200 with a real blob. A failed export goes back to idle with an
  // honest error — never a green "Done" over an error page saved as .csv.
  // ExportButton itself refuses simulated progress; this keeps it truthful.
  const runExport = useCallback(async () => {
    setExportStatus("working");
    try {
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
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setExportStatus("done");
    } catch (error) {
      setExportStatus("idle");
      toast(
        "Export failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }, []);
  const scraping = flow.tracking || flow.bulkTracking;
  const work = useWorkIndicator({
    scraping,
    reachable: boot.kind === "ready",
    connecting: boot.kind === "loading",
  });

  const priceDrops = alerts.filter((a) => a.type === "price_drop").length;
  const failures = alerts.filter((a) => a.type === "scrape_failed").length;

  return (
    <>
      <SiteNav variant="app" />

      {/* Boot failure is a first-class state with its own recovery, not a
          blank page: the user is told what happened and given one click. */}
      {boot.kind === "error" ? (
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-[52ch] text-center">
            <LiveIndicator
              tone="off"
              label="Cannot reach the backend"
              className="mx-auto"
            />
            <h1 className="font-voice mt-5 text-3xl">
              We can&rsquo;t reach the tracker
            </h1>
            <p className="mt-3 text-[15px] text-muted">
              Nothing is lost &mdash; your tracked products are stored on the
              server. This is on our side. Try again in a moment.
            </p>
            <p className="mt-2 font-data text-[13px] text-muted">
              {boot.message}
            </p>
            <button
              type="button"
              onClick={() => void retryBoot()}
              className="mt-6 min-h-11 rounded-lg border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface"
            >
              Try again
            </button>
          </div>
        </main>
      ) : (
        <main id="main" tabIndex={-1} className="instrument-grid mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-voice text-[42px] leading-[1.05]">
                Price Tracker
              </h1>
              <p className="font-data mt-2 text-[13px] tracking-[0.08em] text-muted uppercase">
                Validated observations only. Failures stay visible.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <LiveIndicator tone={work.tone} label={work.label} />
              <ExportButton
                status={exportStatus}
                onExport={runExport}
                onReset={resetExport}
              />
            </div>
          </header>

          {boot.kind === "loading" ? (
            <p className="mt-2 text-[13px] text-muted" role="status">
              Loading your tracked prices…
            </p>
          ) : (
            <p className="mt-2 font-data text-[13px] text-muted">
              backend {boot.health.environment} · database{" "}
              {/* The health body separates "configured" from "reachable";
                  saying "connected" about an env var would not. */}
              <span
                className={
                  boot.health.database === "unreachable"
                    ? "font-medium text-danger"
                    : undefined
                }
              >
                {describeDatabase(boot.health)}
              </span>
            </p>
          )}

          {/* Order follows the mockup and the 80/20 law: the task the visitor
              came to do (find a product) leads, then the overview figures,
              then the tracked grid. Signals and run history are evidence —
              they sit below the product list instead of competing with the
              task above the fold. */}
          <TrackPanel flow={flow} />

          <div className="mt-8">
            <OverviewBand
              trackedCount={targets.length}
              drops={priceDrops}
              failures={failures}
              runs={runs}
            />
          </div>

          <TargetsGrid
            targets={targets}
            loading={boot.kind === "loading"}
            error={targetsError}
            onChanged={refresh}
            onUntracked={untrack}
          />

          <SignalsPanel alerts={alerts} changes={changes} />
          <RunsStrip runs={runs} />

          <footer className="mt-10 flex flex-wrap items-start justify-between gap-4 border-t border-border pt-6">
            {/* The schedule is real, so it counts down in real time — and the
                caption admits the check can run late rather than implying the
                clock is a promise. */}
            <Countdown className="max-w-md" />
            <p className="flex flex-wrap items-center gap-4 text-[13px] text-muted">
              <span>components adapted from xevrion/ui-lab (MIT)</span>
              <a href="#/" className="inline-block py-1.5 hover:text-foreground">
                Landing
              </a>
              <a href="#/docs" className="inline-block py-1.5 hover:text-foreground">
                Docs
              </a>
              <a href="#/changelog" className="inline-block py-1.5 hover:text-foreground">
                Changelog
              </a>
            </p>
          </footer>
        </main>
      )}
    </>
  );
}