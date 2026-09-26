// Adapted from xevrion/ui-lab (MIT) src/lab/components/live-indicator.tsx.
// A breathing pip that says "something is happening right now". Used here for
// two honest facts only: the backend is reachable, and a scrape is in flight.
// It is NEVER used to imply a check succeeded, and it never ticks a fake
// number. Loops are CSS keyframes so the breath stays off the main thread.
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/cn";
import { formatNumberIN } from "../../lib/format";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Slow on purpose: a live dot should breathe, not flash. The reconnect blink
// is a harder pulse so it reads as trying.
const KEYFRAMES = `
@keyframes live-indicator-breathe {
  0%, 100% { opacity: 1; scale: 1; }
  50% { opacity: 0.7; scale: 0.88; }
}
@keyframes live-indicator-sonar {
  0% { opacity: 0.45; scale: 1; }
  70%, 100% { opacity: 0; scale: 2.6; }
}
@keyframes live-indicator-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
`;

type Tone = "live" | "busy" | "off";

export function LiveIndicator({
  count,
  tone = "live",
  label,
  className,
}: {
  /** Omit to show state only. When present, digits roll when it changes. */
  count?: number;
  tone?: Tone;
  /** Plain-language state. Never a raw backend code. */
  label: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const chars = count === undefined ? [] : formatNumberIN(count).split("");
  const status = tone === "busy" ? "Working" : tone === "off" ? "Idle" : "Live";

  return (
    <span
      className={cn(
        "relative inline-flex h-7 items-center gap-2 rounded-full border border-border",
        "bg-background pr-3 pl-2.5 text-[13px] font-medium text-foreground",
        className,
      )}
    >
      <style>{KEYFRAMES}</style>
      {/* The accessible text states the condition, never the ticking digits. */}
      <span className="sr-only">
        {label}
        {count === undefined ? "" : `: ${formatNumberIN(count)}`}
      </span>

      <span aria-hidden className="relative grid size-2 place-items-center">
        {/* The sonar ring expands out of the pip: "this is happening". */}
        {tone !== "off" && (
          <motion.span
            className="absolute inset-0 rounded-full bg-foreground motion-safe:animate-[live-indicator-sonar_2.4s_ease-out_infinite]"
            style={{ animationName: "live-indicator-sonar" }}
          />
        )}
        <span
          className={cn(
            "relative size-2 rounded-full",
            tone === "live" && "bg-foreground motion-safe:animate-[live-indicator-breathe_2.4s_ease-in-out_infinite]",
            tone === "busy" && "bg-foreground motion-safe:animate-[live-indicator-blink_1.1s_ease-in-out_infinite]",
            tone === "off" && "bg-muted",
          )}
        />
      </span>

      {count !== undefined ? (
        <span aria-hidden className="flex items-center gap-px font-mono tabular-nums">
          {chars.map((char, i) => (
            // Keyed by place from the right, so only the digits that change
            // roll.
            <span key={chars.length - i} className="inline-grid overflow-hidden">
              <AnimatePresence initial={false}>
                <motion.span
                  key={char}
                  variants={makeRoll(reduceMotion)}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="col-start-1 row-start-1"
                >
                  {char}
                </motion.span>
              </AnimatePresence>
            </span>
          ))}
        </span>
      ) : (
        <span aria-hidden>{status}</span>
      )}
    </span>
  );
}

// Slower than a click's roll: nobody caused this change, so it should drift
// past rather than snap.
const makeRoll = (reduce: boolean | null) => ({
  enter: { y: reduce ? "0%" : "100%", opacity: 0 },
  center: { y: "0%", opacity: 1, transition: { duration: 0.3, ease: EASE_OUT } },
  exit: {
    y: reduce ? "0%" : "-100%",
    opacity: 0,
    transition: { duration: 0.22, ease: EASE_OUT },
  },
});

/** The workspace-level "is anything running" strip state. */
export function useWorkIndicator(opts: {
  scraping: boolean;
  reachable: boolean;
  connecting?: boolean;
}): { tone: Tone; label: string } {
  // Never claim "unreachable" before the first answer has even come back.
  if (opts.connecting) return { tone: "off", label: "Connecting to the backend…" };
  if (!opts.reachable) return { tone: "off", label: "Backend unreachable" };
  if (opts.scraping) return { tone: "busy", label: "Checking the store now" };
  return { tone: "live", label: "Connected, idle between checks" };
}
