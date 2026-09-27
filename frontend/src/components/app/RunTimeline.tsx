import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { RelativeTime } from "../ui/relative-time";
import { runCounts } from "../../lib/runStatus";
import { cn } from "../../lib/cn";
import type { RunEntry } from "../../services/api";

// Adapted from xevrion/ui-lab (MIT) src/lab/components/activity-timeline.tsx.
// Kept: node rail, open/close rows, reduced-motion path, single shared clock.
// Dropped: demo seed pool, simulate button, fixed-height scroll region,
// commit/comment/deploy kinds — run statuses carry their own grammar here.
const OPEN = { duration: 0.28, ease: [0.23, 1, 0.32, 1] } as const;
const REVEAL = { duration: 0.25, ease: [0.23, 1, 0.32, 1], delay: 0.06 } as const;
const LEAVE = { duration: 0.15, ease: [0.23, 1, 0.32, 1] } as const;
// Relative times only change by the minute; one shared 15s tick updates
// every row at once instead of each row owning a timer.
const TICK = 15_000;

type RunTone = "ok" | "bad" | "live" | "quiet";

function toneOf(status: string): RunTone {
  if (status === "completed") return "ok";
  if (status === "failed") return "bad";
  if (status === "running" || status === "queued") return "live";
  return "quiet";
}

const NODE: Record<RunTone, string> = {
  ok: "border-success/40 bg-success/10 text-success",
  bad: "border-danger/40 bg-danger/10 text-danger",
  live: "border-primary/40 bg-primary/10 text-primary",
  quiet: "border-border bg-surface text-muted",
};

function ToneIcon({ tone }: { tone: RunTone }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {tone === "ok" && <path d="m3.5 8.5 3 3 6-7" />}
      {tone === "bad" && <path d="m5 5 6 6M11 5l-6 6" />}
      {tone === "live" && <circle cx="8" cy="8" r="3" className="pip-live" fill="currentColor" stroke="none" />}
      {tone === "quiet" && <circle cx="8" cy="8" r="3" />}
    </svg>
  );
}

/** Recent scheduler runs as an activity timeline: status rail, trigger, counts, time. */
export function RunTimeline({ runs, limit = 8 }: { runs: RunEntry[]; limit?: number }) {
  const reduce = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK);
    return () => window.clearInterval(id);
  }, []);
  // Re-keyed clock keeps every row's relative time in agreement.
  void now;

  const visible = runs.slice(0, limit);
  if (visible.length === 0) {
    return <p className="mt-2 text-sm text-muted">No runs loaded yet.</p>;
  }

  return (
    <ol aria-label="Recent runs" className="flex flex-col">
      <AnimatePresence initial={false}>
        {visible.map((run, i) => {
          const tone = toneOf(run.status);
          const counts = runCounts(run);
          const label =
            run.status.charAt(0).toUpperCase() + run.status.slice(1);
          return (
            <motion.li
              key={run.id}
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0, transition: LEAVE }}
              transition={OPEN}
              className="relative overflow-hidden"
            >
              {i < visible.length - 1 && (
                <span aria-hidden className="absolute top-9 bottom-1 left-[15.5px] w-px bg-border" />
              )}
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={REVEAL}
                className="flex gap-3 pb-5"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full border",
                    NODE[tone],
                  )}
                >
                  <ToneIcon tone={tone} />
                </span>
                <div className="min-w-0 flex-1 pt-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm text-muted">
                      <span className="font-semibold text-foreground capitalize">{run.triggerType}</span>{" "}
                      · {label}
                      {counts !== "" && (
                        <span className="tabular-nums"> · {counts}</span>
                      )}
                    </p>
                    <span className="shrink-0 text-xs text-muted">
                      <RelativeTime date={run.startedAt} />
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted tabular-nums">
                    {run.targetCount} target{run.targetCount === 1 ? "" : "s"}
                    {run.failureCount > 0 && (
                      <span className="font-medium text-danger">
                        {" "}· {run.failureCount} failed
                      </span>
                    )}
                  </p>
                </div>
              </motion.div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
