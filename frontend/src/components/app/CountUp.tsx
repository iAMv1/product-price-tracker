import { useEffect, useRef } from "react";
import { animate, useInView } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";

/**
 * Count-up figure for summary tiles. Counts once on first view, jumps
 * straight to the value under reduced motion, and never shows fractions
 * for integer stats.
 */
export function CountUp({
  value,
  format = (v: number) => String(Math.round(v)),
  className,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!inView || reduce) {
      el.textContent = formatRef.current(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.7,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = formatRef.current(v);
      },
    });
    return () => controls.stop();
  }, [inView, value, reduce]);

  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  );
}
