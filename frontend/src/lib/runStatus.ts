import type { RunEntry } from "../services/api";

/**
 * Run-feed status grammar.
 *
 * GET /api/runs can return five states — queued, running, completed, failed,
 * abandoned (a crashed run recovered by the next scheduler tick) — and each
 * one has to be SAID, in words, with a tone from the existing tokens: neutral
 * for done, amber (`alert`) for live, red (`danger`) for broken.
 *
 * Two rules, borrowed from StatusPill:
 *  - the visible/spoken label is never the raw enum; an unknown future state
 *    degrades to a neutral pill instead of leaking "queued_v2" or rendering
 *    unstyled;
 *  - the raw value still travels in the tooltip so a developer can debug it.
 *
 * Dot shape carries a second channel: filled = happening / finished, hollow =
 * no attempt recorded yet (queued before work, abandoned mid-flight).
 */

export type RunStatus = "queued" | "running" | "completed" | "failed" | "abandoned";

/** Tone buckets map straight onto the design tokens (see RUN_TONE usage). */
export type RunTone = "neutral" | "live" | "bad";

export interface RunStatusMeta {
  /** Human label — shown, and the one a screen reader speaks. */
  label: string;
  tone: RunTone;
  /** Pill classes: border, background, text. */
  pill: string;
  /** Status-dot classes. */
  dot: string;
  /** Raw value is a known state (false => fallback label, tooltip keeps it). */
  known: boolean;
}

const META: Record<RunStatus, RunStatusMeta> = {
  completed: {
    label: "Completed",
    tone: "neutral",
    pill: "border-border bg-background text-foreground",
    dot: "border-foreground bg-foreground",
    known: true,
  },
  running: {
    label: "Running",
    tone: "live",
    pill: "border-alert/50 bg-alert/10 text-alert-fg",
    dot: "border-alert bg-alert motion-safe:animate-pulse",
    known: true,
  },
  queued: {
    label: "Queued",
    tone: "live",
    pill: "border-alert/35 bg-background text-alert-fg",
    dot: "border-alert bg-background",
    known: true,
  },
  failed: {
    label: "Failed",
    tone: "bad",
    pill: "border-danger bg-danger/10 text-danger",
    dot: "border-danger bg-danger",
    known: true,
  },
  abandoned: {
    label: "Abandoned",
    tone: "bad",
    pill: "border-danger/70 bg-background text-danger",
    dot: "border-danger bg-background",
    known: true,
  },
};

/** No raw enum ever reaches the eye; the tooltip still names it. */
const UNKNOWN: RunStatusMeta = {
  label: "Run recorded",
  tone: "neutral",
  pill: "border-border bg-background text-foreground",
  dot: "border-muted bg-muted",
  known: false,
};

export function runStatus(status: string): RunStatusMeta {
  return (Object.keys(META) as RunStatus[]).includes(status as RunStatus)
    ? META[status as RunStatus]
    : UNKNOWN;
}

/**
 * Attempt tallies as words: "3 ok · 2 failed". Empty string when no attempt
 * has been recorded yet — a queued run showing "0 ok" would read as a run
 * that checked nothing and passed.
 */
export function runCounts(run: RunEntry): string {
  const attempted = run.successCount + run.retriedCount + run.failureCount;
  if (attempted === 0) return "";
  const parts = [`${run.successCount} ok`];
  if (run.retriedCount > 0) parts.push(`${run.retriedCount} retried`);
  if (run.failureCount > 0) parts.push(`${run.failureCount} failed`);
  return parts.join(" · ");
}
