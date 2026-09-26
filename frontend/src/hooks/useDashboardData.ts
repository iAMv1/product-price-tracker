import { useCallback, useEffect, useState } from "react";
import {
  fetchAlerts,
  fetchChangeEvents,
  fetchHealth,
  fetchRuns,
  listTracked,
  untrackTarget,
  type AlertItem,
  type ChangeEvent,
  type HealthResponse,
  type RunEntry,
  type TrackedTarget,
} from "../services/api";

export type BootState =
  | { kind: "loading" }
  | { kind: "ready"; health: HealthResponse }
  | { kind: "error"; message: string };

/**
 * Every read the dashboard performs, in one place.
 *
 * Split out of the 679-line Dashboard so the page becomes composition rather
 * than state management. Three rules this hook keeps, which the page used to
 * own implicitly:
 *
 * 1. The bonus feed (alerts / change events / runs) is OPTIONAL. A failure
 *    there must never take down the dashboard — a price tracker that hides
 *    tracked prices because an alert query failed is lying by omission.
 * 2. Targets are the source of truth. `refresh` re-reads them after any
 *    mutation so the page never shows a price the backend no longer has.
 * 3. A boot failure is surfaced, never swallowed.
 */
export function useDashboardData() {
  const [boot, setBoot] = useState<BootState>({ kind: "loading" });
  const [targets, setTargets] = useState<TrackedTarget[]>([]);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [changes, setChanges] = useState<ChangeEvent[]>([]);
  const [runs, setRuns] = useState<RunEntry[]>([]);

  /** Re-reads the optional feed. Failures are silent by design (see rule 1). */
  const refreshFeed = useCallback(async () => {
    try {
      const [a, c, r] = await Promise.all([
        fetchAlerts(),
        fetchChangeEvents(),
        fetchRuns(),
      ]);
      setAlerts(a);
      setChanges(c);
      setRuns(r);
    } catch {
      // Intentionally empty: the dashboard is fully usable without this feed.
    }
  }, []);

  /** Re-reads targets (the source of truth) and then the optional feed. */
  const refresh = useCallback(async () => {
    try {
      setTargets(await listTracked());
      setTargetsError(null);
    } catch (error) {
      setTargetsError(
        error instanceof Error ? error.message : "Unknown error",
      );
    }
    await refreshFeed();
  }, [refreshFeed]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Health and targets fail INDEPENDENTLY: a dead DB must not masquerade
      // as a dead backend (the 503 branch), and boot must not be all-or-nothing.
      let health: HealthResponse;
      try {
        health = await fetchHealth();
      } catch (error) {
        if (cancelled) return;
        setBoot({
          kind: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
        return;
      }
      if (cancelled) return;
      setBoot({ kind: "ready", health });
      try {
        const list = await listTracked();
        if (cancelled) return;
        setTargets(list);
        setTargetsError(null);
      } catch (error) {
        if (cancelled) return;
        setTargetsError(
          error instanceof Error ? error.message : "Unknown error",
        );
      }
      await refreshFeed();
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshFeed]);

  /**
   * Re-runs the boot after a failure. The dashboard's "Try again" calls this
   * rather than reloading the page: it goes back to the loading state and
   * re-reads health + targets, which is what the user actually wanted, and it
   * keeps the tab (and any in-flight work) alive.
   */
  const retryBoot = useCallback(async () => {
    setBoot({ kind: "loading" });
    setTargetsError(null);
    let health: HealthResponse;
    try {
      health = await fetchHealth();
    } catch (error) {
      setBoot({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return;
    }
    setBoot({ kind: "ready", health });
    try {
      const list = await listTracked();
      setTargets(list);
      setTargetsError(null);
    } catch (error) {
      setTargetsError(
        error instanceof Error ? error.message : "Unknown error",
      );
    }
    await refreshFeed();
  }, [refreshFeed]);

  const untrack = useCallback(
    (id: string) => {
      setTargets((current) => current.filter((t) => t.id !== id));
      void untrackTarget(id)
        .then(refresh)
        .catch(async (error: unknown) => {
          // The optimistic removal was wrong — restore truth FIRST (refresh
          // clears targetsError on success), THEN explain, or the message
          // gets wiped by the very call that follows it.
          await refresh();
          setTargetsError(
            error instanceof Error ? error.message : "Unknown error",
          );
        });
    },
    [refresh],
  );

  return {
    boot,
    retryBoot,
    targets,
    targetsError,
    alerts,
    changes,
    runs,
    refresh,
    untrack,
  };
}
