import { Bone } from "../ui/skeleton-loader";

/**
 * Full-screen route loader: brand mark plus skeleton bars, no naked
 * "Loading…" text. The bars shimmer (static under reduced motion) and carry
 * no digits, so nothing on screen can be mistaken for data.
 */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-24 sm:px-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-11 place-items-center rounded-2xl bg-foreground text-base font-bold text-background motion-safe:animate-pulse"
        >
          PT
        </span>
        <div className="grid gap-2">
          <Bone className="h-4 w-40 rounded" />
          <Bone className="h-3 w-28 rounded" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Bone className="h-24 rounded-2xl" />
        <Bone className="h-24 rounded-2xl" />
        <Bone className="h-24 rounded-2xl" />
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/** Small inline skeleton for one-line loading states (trends, feeds). */
export function LineLoader({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <Bone className="h-4 w-32 rounded" />
      <span className="sr-only">{label}…</span>
    </div>
  );
}
