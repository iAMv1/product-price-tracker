import { useEffect, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/cn";

const PERIOD_MS = 2 * 60 * 60 * 1000; // the cron cadence, 2 hours

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Countdown to the next scheduled check.
 *
 * The one number on the landing page that moves on its own, and it moves for a
 * real reason: the external cron fires every 2 hours, so there is a genuine
 * boundary to count toward. It counts to the next 2-hour boundary in local
 * time, which is exactly when the next wake-up is due.
 *
 * HONESTY: this is a SCHEDULE, not a guarantee. A free-tier instance may be
 * asleep and the check will run late, so the caption says so. It is never used
 * to imply a check is in progress or that one succeeded.
 */
export function Countdown({
  className,
  showCaption = true,
}: {
  className?: string;
  showCaption?: boolean;
}) {
  const reduce = useReducedMotion();
  const [remaining, setRemaining] = useState(() => PERIOD_MS - (Date.now() % PERIOD_MS));

  useEffect(() => {
    const tick = () =>
      setRemaining(PERIOD_MS - (Date.now() % PERIOD_MS));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const total = Math.max(0, Math.floor(remaining / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const text = `${pad(h)}:${pad(m)}:${pad(s)}`;

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
        Next scheduled check
      </p>
      <p className="mt-1.5 flex items-baseline gap-2">
        <span
          className="font-data text-[28px] leading-none font-semibold tracking-tight text-foreground tabular-nums"
          // The visible clock stops animating under reduced motion; the text
          // still updates once a second, which is information, not decoration.
          aria-live="off"
        >
          {text}
        </span>
        <span className="text-[13px] text-muted">from now</span>
      </p>
      {/* The full value is spoken once, not every second. */}
      <span className="sr-only" aria-live="polite">
        Next check in {h} hours {m} minutes
      </span>
      {showCaption && (
        <p className="mt-2 max-w-[42ch] text-[13px] leading-snug text-muted">
          An external cron wakes the backend. If the instance is asleep, the
          check runs late &mdash; and says so, rather than pretending it was on time.
        </p>
      )}
      {reduce ? null : null}
    </div>
  );
}