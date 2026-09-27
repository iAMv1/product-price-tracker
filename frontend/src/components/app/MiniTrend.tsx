import { useId } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";

/**
 * Compact dashboard trend. Static by design: the tracked detail page owns the
 * scrubbable chart, so rows show shape without duplicating interaction.
 */
export function MiniTrend({ values }: { values: number[] }) {
  const reduce = useReducedMotion();
  const gradientId = useId();
  if (values.length < 2) return null;

  const width = 120;
  const height = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = 4 + (1 - (value - min) / span) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${points.join(" L")}`;
  const area = `${line} L${width},${height} L0,${height} Z`;
  const lastY = 4 + (1 - (values[values.length - 1]! - min) / span) * (height - 8);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-9 w-[120px] shrink-0"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      {/* Draw-once, same language as the main chart: stroke direction carries
          time direction (past → present). Static under reduced motion. */}
      <motion.path
        d={line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      />
      <circle cx={width} cy={lastY} r={2.5} fill="var(--primary)" />
    </svg>
  );
}
