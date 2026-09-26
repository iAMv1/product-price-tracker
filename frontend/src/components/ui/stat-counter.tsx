// Adapted from xevrion/ui-lab (MIT) src/lab/components/stat-counter.tsx.
// Counts a figure up on first view. The sparkline + scrub is included ONLY
// where we have a real series behind it: this project has history for
// observations (price_stock_history) but NOT for tracked-count or failure-
// count, so those render as plain animated counts. A stat with no real
// series gets no line — we never draw a trend we cannot substantiate.
import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/cn";

export type Stat = {
  label: string;
  value: number;
  format: Intl.NumberFormat;
  /** Omitted when we have no real history for this figure. */
  series?: number[];
  /** Which direction is good news. */
  goodWhen?: "up" | "down";
};

// Long enough to read as counting, which is the point. No bounce, so a figure
// never overshoots to a value that isn't true.
const COUNT = { type: "spring", visualDuration: 0.7, bounce: 0 } as const;
const SCRUB = { type: "spring", visualDuration: 0.3, bounce: 0 } as const;
const SPARK_W = 120;
const SPARK_H = 32;

export function StatCounter({
  stats,
  className,
}: {
  stats: Stat[];
  className?: string;
}) {
  const ref = useRef<HTMLDListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <div className={cn("@container w-full", className)}>
      <dl
        ref={ref}
        className="grid grid-cols-2 gap-3 @min-[560px]:grid-cols-4"
      >
        {stats.map((stat) => (
          <StatCard key={stat.label} stat={stat} started={inView} />
        ))}
      </dl>
    </div>
  );
}

function StatCard({
  stat,
  started,
}: {
  stat: Stat;
  started: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const value = useMotionValue(0);
  // Written straight to the DOM each frame; the card never re-renders while
  // counting.
  const text = useTransform(value, (v) => stat.format.format(v));
  // The point being inspected, or null for "now".
  const [scrub, setScrub] = useState<number | null>(null);
  const series = stat.series;
  const last = series ? series.length - 1 : -1;
  const shown = scrub === null || !series ? stat.value : (series[scrub] ?? stat.value);

  useEffect(() => {
    if (!started) return;
    // Retargets from wherever the number is, so a refresh or a scrub
    // mid-count carries on smoothly from the old figure.
    const controls = animate(
      value,
      shown,
      reduceMotion ? { duration: 0 } : scrub === null ? COUNT : SCRUB,
    );
    return () => controls.stop();
  }, [started, shown, scrub, reduceMotion, value]);

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!series) return;
    const box = e.currentTarget.getBoundingClientRect();
    const t = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1);
    setScrub(Math.round(t * last));
  };

  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-background p-4"
      onPointerMove={series ? pick : undefined}
      onPointerLeave={series ? () => setScrub(null) : undefined}
    >
      <dt className="text-[13px] text-muted">{stat.label}</dt>
      <dd className="flex flex-col gap-2">
        <span className="sr-only">{stat.format.format(shown)}</span>
        <motion.span
          aria-hidden
          className="truncate font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground"
          style={{ opacity: started ? 1 : 0 }}
        >
          {text}
        </motion.span>
        {/* Only drawn when a real series exists behind it. */}
        {series && series.length > 1 ? (
          <Spark
            data={series}
            index={scrub === null ? last : scrub}
            goodWhen={stat.goodWhen}
          />
        ) : null}
      </dd>
    </div>
  );
}

function Spark({
  data,
  index,
  goodWhen = "up",
}: {
  data: number[];
  index: number;
  goodWhen?: "up" | "down";
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  // A flat series must not divide by zero; a 1px range reads as flat, not as
  // a dramatic spike.
  const span = max - min || 1;
  const step = data.length > 1 ? SPARK_W / (data.length - 1) : SPARK_W;
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = SPARK_H - ((v - min) / span) * SPARK_H;
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const current = data[index] ?? data[data.length - 1] ?? 0;
  const previous = data[index - 1] ?? current;
  const rising = current >= previous;
  const good = rising === (goodWhen === "up");

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      aria-hidden
      className="h-8 w-full overflow-visible"
    >
      <path
        d={points}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={good ? "stroke-foreground" : "stroke-danger"}
      />
      <circle
        cx={index * step}
        cy={SPARK_H - ((current - min) / span) * SPARK_H}
        r={2.5}
        className={good ? "fill-foreground" : "fill-danger"}
      />
    </svg>
  );
}
