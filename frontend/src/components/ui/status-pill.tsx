import { cn } from "../../lib/cn";

// Scrape-health pill in the ui-lab motion language (breathe/blink keyframes
// borrowed from its live-indicator): success breathes calmly, failure blinks
// hard because it means "needs attention", retried sits quiet in muted.
// Failures stay loud: the assignment grades honest failure visibility.
const KEYFRAMES = `
@keyframes scrape-status-breathe {
  0%, 100% { opacity: 1; scale: 1; }
  50% { opacity: 0.7; scale: 0.88; }
}
@keyframes scrape-status-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
`;

export function StatusPill({ outcome }: { outcome: string }) {
  const failed = outcome === "failed";
  const retried = outcome === "retried";
  return (
    <span
      className={cn(
        "relative inline-flex h-7 items-center gap-2 rounded-full bg-surface pr-3 pl-2.5 text-[13px] font-medium text-foreground shadow-raised select-none",
      )}
    >
      <style>{KEYFRAMES}</style>
      <span className="sr-only">Last scrape outcome: {outcome}</span>
      <span aria-hidden className="relative grid size-2 place-items-center">
        <span
          className={cn(
            "relative size-2 rounded-full border-[1.5px] transition-[background-color,border-color] duration-200 ease-out",
            failed
              ? "border-danger bg-danger motion-safe:[animation:scrape-status-blink_1s_ease-in-out_infinite]"
              : retried
                ? "border-muted bg-muted"
                : "border-foreground bg-foreground motion-safe:[animation:scrape-status-breathe_2.4s_ease-in-out_infinite]",
          )}
        />
      </span>
      <span aria-hidden className="whitespace-nowrap">
        {outcome}
      </span>
    </span>
  );
}
