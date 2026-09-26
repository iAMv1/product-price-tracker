// Adapted from xevrion/ui-lab (MIT) src/lab/components/skeleton-loader.tsx.
// Shimmering bones that occupy the EXACT box the real content will fill, so
// the card never jumps when data arrives. Skeleton and content share one grid
// cell; that shared cell is the whole trick.
//
// HONESTY RULE, enforced below: a bone never contains a digit. A grey bar is
// obviously not a price; a grey "27,490" would be a lie. Price-shaped slots
// are deliberately wider/shorter proportioned to the odometer, never filled
// with placeholder numerals.
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

// Short enough that the last block lands just after the first, long enough to
// read as a sequence.
const STAGGER = 40;

const CSS = `
.skeleton-bone {
  position: relative;
  overflow: hidden;
  background: color-mix(in oklab, var(--foreground) 7%, transparent);
}
[aria-busy="true"] .skeleton-bone::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent,
    color-mix(in oklab, var(--foreground) 6%, transparent), transparent);
  translate: -100% 0;
  animation: skeleton-shimmer 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes skeleton-shimmer {
  70%, 100% { translate: 100% 0; }
}
@media (prefers-reduced-motion: reduce) {
  [aria-busy="true"] .skeleton-bone::after { animation: none; display: none; }
}
`;

export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton-bone", className)} />;
}

/**
 * One slot that shows a skeleton while `loading` and cross-fades to real
 * content when it arrives. Children must occupy the same geometry as the
 * skeleton, or the card will jump.
 */
export function SkeletonSlot({
  index,
  loading,
  skeleton,
  children,
}: {
  index: number;
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const delay = `${index * STAGGER}ms`;
  const loaded = !loading;
  return (
    <div className="grid">
      {/* Fades out under the arriving content. On a reload it appears at once:
          the old content is already gone, and a slow fade would leave a blank
          card for a beat. */}
      <div
        aria-hidden
        className={cn(
          "col-start-1 row-start-1 transition-[opacity] ease-out",
          loaded ? "opacity-0 duration-150" : "duration-0",
        )}
        style={{ transitionDelay: loaded ? delay : "0ms" }}
      >
        {skeleton}
      </div>
      {loaded && (
        <div
          className={cn(
            "col-start-1 row-start-1 transition-[opacity,filter,translate]",
            "duration-[250ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
            "starting:opacity-0 motion-safe:starting:translate-y-0.5",
            "motion-safe:starting:blur-[4px]",
          )}
          style={{ transitionDelay: delay }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The target-card loading state. Mirrors the real card's zone map exactly:
 * name, option, price, delta, chart, meta, actions. Every bone is shaped like
 * what replaces it and NONE contains a number.
 */
export function TargetCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      <style>{CSS}</style>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-busy="true"
          className="flex flex-col rounded-2xl border border-border p-5"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <span className="sr-only">Loading tracked product</span>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <div className="flex h-6 items-center">
                <Bone className="h-3.5 w-40 rounded-full" />
              </div>
              <div className="flex h-5 items-center">
                <Bone className="h-3 w-24 rounded-full" />
              </div>
            </div>
            {/* status pill, same footprint as the real one */}
            <Bone className="h-6 w-28 shrink-0 rounded-full" />
          </div>
          {/* price slot: one 1.1em-tall block, the odometer's line box */}
          <div className="mt-5 flex h-11 items-center">
            <Bone className="h-8 w-32 rounded-md" />
          </div>
          <div className="mt-2 flex h-5 items-center">
            <Bone className="h-3 w-44 rounded-full" />
          </div>
          {/* sparkline footprint */}
          <Bone className="mt-4 h-11 w-full rounded-md" />
          <div className="mt-3 flex h-4 items-center gap-2">
            <Bone className="h-2.5 w-24 rounded-full" />
            <Bone className="h-2.5 w-16 rounded-full" />
          </div>
          {/* action row, separated by the same rule the real card uses */}
          <div className="mt-4 flex gap-2 border-t border-border pt-4">
            <Bone className="h-11 w-24 rounded-lg" />
            <Bone className="h-11 w-20 rounded-lg" />
          </div>
        </div>
      ))}
    </>
  );
}