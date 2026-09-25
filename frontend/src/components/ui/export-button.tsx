import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/cn";

// Export button in the ui-lab download-button language (fixed-width morph
// idle to done, icon swap with blur), minus its simulated progress: a CSV
// export is instant, so faking a fill would be dishonest.
export type ExportStatus = "idle" | "working" | "done";

const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;

export function ExportButton({
  status,
  onExport,
  onReset,
  className,
}: {
  status: ExportStatus;
  onExport: () => void;
  onReset: () => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [announcement, setAnnouncement] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (status !== "done") return;
    setAnnouncement("CSV export downloaded");
    timer.current = setTimeout(onReset, 1800);
    return () => clearTimeout(timer.current);
  }, [status, onReset]);

  const done = status === "done";
  const working = status === "working";

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={working ? "Preparing CSV" : "Export full scrape history as CSV"}
        aria-disabled={done || undefined}
        onClick={() => {
          if (status === "idle") {
            setAnnouncement("Preparing CSV");
            onExport();
          }
        }}
        className={cn(
          "relative inline-flex h-11 w-[168px] max-w-full touch-manipulation items-center justify-center overflow-hidden rounded-full bg-surface text-[15px] font-medium text-foreground shadow-raised outline-hidden select-none",
          "transition-[scale] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none",
          "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground",
          done && "cursor-default",
        )}
      >
        <span aria-hidden className="flex items-center gap-2">
          <span className="grid">
            <motion.svg
              viewBox="0 0 24 24"
              className="col-start-1 row-start-1 size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={
                done
                  ? { scale: 0.25, opacity: 0, filter: "blur(4px)" }
                  : { scale: 1, opacity: 1, filter: "blur(0px)" }
              }
              transition={ICON_SWAP}
            >
              <path d="M12 3.75v10M7.75 9.5 12 13.75l4.25-4.25" />
              <path d="M4.25 14.5v3.25c0 1.1.9 2 2 2h11.5c1.1 0 2-.9 2-2V14.5" />
            </motion.svg>
            <motion.svg
              viewBox="0 0 24 24"
              className="col-start-1 row-start-1 size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={
                done
                  ? { scale: 1, opacity: 1, filter: "blur(0px)" }
                  : reduceMotion
                    ? { scale: 1, opacity: 0, filter: "blur(0px)" }
                    : { scale: 0.25, opacity: 0, filter: "blur(4px)" }
              }
              transition={ICON_SWAP}
            >
              <path d="m5 12.5 4.5 4.5L19 7" />
            </motion.svg>
          </span>
          <span className="relative">
            <Word visible={!done}>{working ? "Working" : "Export CSV"}</Word>
            <Word visible={done}>Done</Word>
          </span>
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </span>
  );
}

function Word({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "block whitespace-nowrap transition-[opacity,filter,translate] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity]",
        visible
          ? "relative translate-y-0 opacity-100 blur-[0px] duration-200"
          : "absolute top-0 left-0 translate-y-0.5 opacity-0 blur-[4px] duration-100 motion-reduce:translate-y-0 motion-reduce:blur-[0px]",
      )}
    >
      {children}
    </span>
  );
}
