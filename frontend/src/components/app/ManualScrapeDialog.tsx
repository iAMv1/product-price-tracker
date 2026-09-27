import { useEffect, useId, useRef, useState } from "react";
import { fetchScrapeLog, rescrapeTarget } from "../../services/api";
import { formatRupees } from "../../lib/format";
import { Modal } from "./Modal";
import { PrimaryButton, SecondaryButton } from "./controls";

type Phase = "running" | "observed" | "success" | "error";

/**
 * Manual-scrape progress without invented subtasks. The backend exposes one
 * synchronous operation, so the dialog reports request, wait, and result —
 * plus one honest intermediate state: when a fresh success observation lands
 * in the log before the HTTP round-trip finishes, the dialog says what is
 * already stored instead of still claiming to wait for it.
 */
export function ManualScrapeDialog({
  open,
  targetId,
  productName,
  onClose,
  onFinished,
}: {
  open: boolean;
  targetId: string;
  productName: string;
  onClose: () => void;
  onFinished: () => void;
}) {
  const titleId = useId();
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("running");
  const [summary, setSummary] = useState<{ succeeded: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // Live progress, scoped to THIS run: the newest log rows at or after the
  // moment the dialog opened. Older rows belong to previous runs and must
  // never masquerade as current progress.
  const [progress, setProgress] = useState<string | null>(null);
  // A fresh success observation seen before HTTP resolves: the value is
  // stored, only run completion is still in flight. Mirrored in a ref so
  // the request callback below never reads a stale render's value.
  const [observed, setObserved] = useState<{ price: number; stock: string } | null>(null);
  const observedRef = useRef<{ price: number; stock: string } | null>(null);
  function noteObserved(value: { price: number; stock: string }) {
    observedRef.current = value;
    setObserved(value);
  }
  // Latest callback without re-subscribing: parents (rows especially) pass
  // fresh inline closures every render, and re-running a scrape per render
  // would bill the store once per paint.
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  // The in-flight request survives effect re-runs (notably StrictMode's
  // mount-cleanup-remount in dev): cleanup only ever clears UI timers, never
  // aborts, so a remount adopts the pending promise instead of firing a
  // second POST — while a real close aborts explicitly below.
  const flightRef = useRef<{
    key: string;
    promise: Promise<{ succeeded: number; failed: number }>;
    controller: AbortController;
  } | null>(null);
  // Progress baseline rides with the flight, not the effect run: a remount
  // must not move the goalposts and miss an observation mid-flight.
  const startedAtRef = useRef<string>("");

  useEffect(() => {
    if (!open) {
      // Genuine close (not a remount): stop waiting for good.
      flightRef.current?.controller.abort();
      flightRef.current = null;
      return;
    }
    const key = `${targetId}:${attempt}`;
    // UI timers restart on every mount: cheap, idempotent, remount-safe.
    // State resets are invisible on remount (same values) and correct on retry.
    setPhase("running");
    setSummary(null);
    setError(null);
    setElapsed(0);
    observedRef.current = null;
    setObserved(null);
    setProgress("Contacting the tracker…");
    // Progress baseline: only attempts recorded after this instant belong
    // to the run this dialog triggered.
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);

    const onResolve = (result: { succeeded: number; failed: number }) => {
      // First handler wins: mount + remount both attach, so dedupe here.
      if (flightRef.current?.key !== key) return;
      flightRef.current = null;
      setSummary(result);
      setPhase("success");
      onFinishedRef.current();
    };
    const onReject = (runError: unknown) => {
      if (flightRef.current?.key !== key) return;
      flightRef.current = null;
      if ((runError as { name?: string } | null)?.name === "AbortError") return;
      // Edge case, stated plainly: the value landed but the run did not
      // complete cleanly, so neither "success" nor plain "failure" is true.
      setError(
        observedRef.current !== null
          ? `Price was observed and stored, but the run did not complete cleanly: ${runError instanceof Error ? runError.message : "Manual scrape failed"}`
          : runError instanceof Error ? runError.message : "Manual scrape failed",
      );
      setPhase("error");
    };

    const existing = flightRef.current;
    if (existing && existing.key === key) {
      // Remount with the request still in flight: adopt it, fire nothing.
      existing.promise.then(onResolve, onReject);
    } else {
      startedAtRef.current = new Date().toISOString();
      const controller = new AbortController();
      const promise = rescrapeTarget(targetId, controller.signal);
      flightRef.current = { key, promise, controller };
      promise.then(onResolve, onReject);
    }

    async function pollAttempts() {
      try {
        const log = await fetchScrapeLog(targetId, 5);
        const fresh = log.filter((entry) => entry.attempted_at >= startedAtRef.current);
        if (fresh.length === 0) {
          setProgress("Contacting the tracker…");
          return;
        }
        const latest = fresh[0]!;
        const detail =
          latest.outcome === "success"
            ? latest.price == null
              ? "price not recorded"
              : formatRupees(latest.price)
            : (latest.error_code ?? "no detail yet");
        setProgress(`Attempt ${latest.attempt_number} recorded — ${latest.outcome} (${detail}).`);
        // Success stored before HTTP resolves: say so now, finish when the
        // run completes. Watching, not assuming — the completion summary
        // still comes from the HTTP response.
        if (latest.outcome === "success" && latest.price != null) {
          if (observedRef.current === null) {
            noteObserved({ price: latest.price, stock: latest.stock ?? "unknown" });
          }
          setPhase((current) => (current === "running" ? "observed" : current));
        }
      } catch {
        // Polling is advisory only; the main request owns real errors.
      }
    }
    const poller = window.setInterval(() => void pollAttempts(), 3000);
    void pollAttempts();
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poller);
    };
  }, [open, targetId, attempt]);

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="text-lg font-semibold tracking-tight text-foreground">
        Running scrape
      </h2>
      <p className="mt-1 text-sm text-muted">{productName}</p>

      {phase === "running" && (
        <div role="status" className="mt-5">
          <div aria-hidden className="h-2 overflow-hidden rounded-full bg-surface">
            <div className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-pulse" />
          </div>
          <p className="mt-3 text-sm text-muted">
            Request sent — waiting for the tracker
            {elapsed >= 2 ? ` (${elapsed} s elapsed)` : ""}. Up to 3 attempts may run.
          </p>
          {progress !== null && (
            <p className="mt-1.5 text-sm font-medium text-foreground" role="status">
              {progress}
            </p>
          )}
        </div>
      )}

      {phase === "observed" && observed && (
        <div role="status" className="mt-5">
          <ul className="grid gap-2 rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            <li><span aria-hidden>✓ </span>Price observed — {formatRupees(observed.price)}</li>
            <li><span aria-hidden>✓ </span>Stock observed — {observed.stock}</li>
            <li><span aria-hidden>✓ </span>Observation stored</li>
          </ul>
          <p className="mt-3 text-sm text-muted">
            Finishing run{elapsed >= 2 ? ` (${elapsed} s elapsed)` : ""}…
          </p>
        </div>
      )}

      {phase === "success" && summary && (
        <p role="status" className="mt-5 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Scrape finished: {summary.succeeded} succeeded, {summary.failed} failed.
        </p>
      )}

      {phase === "error" && (
        <div className="mt-5">
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
          <PrimaryButton className="mt-4" onClick={() => setAttempt((value) => value + 1)}>
            Retry scrape
          </PrimaryButton>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <SecondaryButton onClick={onClose}>Close</SecondaryButton>
      </div>
      <p className="mt-3 text-[13px] text-muted">
        Closing stops waiting here; a check already sent may still finish.
      </p>
    </Modal>
  );
}
