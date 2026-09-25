import { useEffect } from "react";
import {
  motion,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/cn";

// Adapted from xevrion/ui-lab (MIT) src/lab/components/odometer.tsx.
// Rolling digit wheels for the current price; new scrapes roll forward,
// never spin back. Hold-to-repeat + demo dropped; the price is the export.
const GLYPHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function Odometer({
  value,
  digits,
  className,
}: {
  value: number;
  digits?: number;
  className?: string;
}) {
  const width = digits ?? String(Math.max(0, Math.floor(value))).length;
  const modulo = 10 ** width;
  const shown = ((value % modulo) + modulo) % modulo;

  return (
    <div
      className={cn(
        "inline-flex gap-1 rounded-[22px] bg-surface p-1.5 text-[40px] font-medium tracking-tight shadow-raised",
        className,
      )}
    >
      <output className="sr-only" aria-live="polite">
        {shown}
      </output>
      {Array.from({ length: width }, (_, i) => {
        const place = 10 ** (width - 1 - i);
        return <Wheel key={place} turns={Math.floor(value / place)} />;
      })}
    </div>
  );
}

function Wheel({ turns }: { turns: number }) {
  const reduceMotion = useReducedMotion();
  const position = useSpring(turns, { visualDuration: 0.35, bounce: 0.15 });
  const velocity = useVelocity(position);
  const filter = useTransform(velocity, (v) => {
    const blur = Math.min(Math.max((Math.abs(v) - 4) / 16, 0), 1) * 1.5;
    return blur > 0 ? `blur(${blur}px)` : "none";
  });

  useEffect(() => {
    if (reduceMotion) position.jump(turns);
    else position.set(turns);
  }, [turns, reduceMotion, position]);

  return (
    <div
      aria-hidden
      className="relative h-[1.4em] w-[0.8em] overflow-hidden rounded-2xl bg-background shadow-wheel"
    >
      <motion.div
        className="absolute inset-0 [mask-image:linear-gradient(transparent,black_20%,black_80%,transparent)]"
        style={{ filter: reduceMotion ? "none" : filter }}
      >
        {GLYPHS.map((digit) => (
          <Glyph key={digit} digit={digit} position={position} />
        ))}
      </motion.div>
    </div>
  );
}

function Glyph({
  digit,
  position,
}: {
  digit: number;
  position: MotionValue<number>;
}) {
  // Every glyph sits within five slots of the current position, so the wheel
  // loops forever with only ten nodes. The jump from +5 to -5 happens off view.
  const transform = useTransform(position, (p) => {
    const offset = ((((digit - p) % 10) + 15) % 10) - 5;
    return `translateY(${offset * 100}%)`;
  });

  return (
    <motion.span
      className="absolute inset-0 flex items-center justify-center tabular-nums"
      style={{ transform }}
    >
      {digit}
    </motion.span>
  );
}
