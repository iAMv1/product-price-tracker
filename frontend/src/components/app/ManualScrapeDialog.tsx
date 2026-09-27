import { useEffect, useId, useState } from "react";
import { rescrapeTarget } from "../../services/api";
import { Modal } from "./Modal";
import { PrimaryButton, SecondaryButton } from "./controls";

type Phase = "running" | "success" | "error";

/**
 * Manual-scrape progress without invented subtasks. The backend exposes one
 * synchronous operation, so the dialog reports request, wait, and result—not
 * fake fetch/parse/validate/save stages.
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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();
    setPhase("running");
    setSummary(null);
    setError(null);
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);

    async function run() {
      try {
        const result = await rescrapeTarget(targetId, controller.signal);
        if (cancelled) return;
        setSummary(result);
        setPhase("success");
        onFinished();
      } catch (runError) {
        if (cancelled || (runError as { name?: string } | null)?.name === "AbortError") return;
        setError(runError instanceof Error ? runError.message : "Manual scrape failed");
        setPhase("error");
      } finally {
        window.clearInterval(timer);
      }
    }
    void run();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [open, targetId, attempt, onFinished]);

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
