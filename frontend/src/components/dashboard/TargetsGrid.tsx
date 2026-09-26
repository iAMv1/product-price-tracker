import { motion } from "motion/react";
import { TargetCard } from "../TargetCard";
import { SectionTitle } from "../site-nav";
import { TargetCardSkeleton } from "../ui/skeleton-loader";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import type { TrackedTarget } from "../../services/api";

/**
 * The tracked-products grid.
 *
 * Loading, error, empty, and populated are all real states here — the loading
 * one uses skeletons shaped like the cards that replace them, and critically
 * those skeletons contain NO digits, because a grey "27,490" would read as a
 * price and a price tracker that shows a fake one is worse than one that shows
 * nothing.
 *
 * The stagger is capped at 300ms total so a long list does not make the user
 * wait for the last card.
 */
export function TargetsGrid({
  targets,
  loading,
  error,
  onChanged,
  onUntracked,
}: {
  targets: TrackedTarget[];
  loading: boolean;
  error: string | null;
  onChanged: () => Promise<void>;
  onUntracked: (id: string) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <section aria-label="Tracked products" className="mt-10">
      <SectionTitle
        right={
          !loading && targets.length > 0 ? (
            <span className="font-data text-[13px] text-muted tabular-nums">
              {targets.length}
            </span>
          ) : undefined
        }
      >
        Tracked
      </SectionTitle>

      {error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <TargetCardSkeleton count={2} />
        </div>
      ) : targets.length === 0 && error === null ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-[17px] font-medium text-foreground">
            Track your first price
          </p>
          <p className="mx-auto mt-2 max-w-[46ch] text-sm text-muted">
            Search by name, paste a product link, or type the store ID if you
            have it. We re-check every 2 hours and keep the last price even
            when a check fails.
          </p>
          {/* The empty state offers the next action, not just prose. */}
          <button
            type="button"
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>(
                'section[aria-label="Find a product"] input',
              );
              input?.focus();
            }}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Find a product
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {targets.map((target, i) => (
            <motion.div
              key={target.id}
              className="h-full"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.32,
                delay: Math.min(i * 0.06, 0.3),
                ease: [0.23, 1, 0.32, 1],
              }}
            >
              <TargetCard
                target={target}
                onChanged={onChanged}
                onUntracked={onUntracked}
              />
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}