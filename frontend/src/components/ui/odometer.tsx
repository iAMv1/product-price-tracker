import { useEffect } from "react";
import {
  motion,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { formatNumberIN } from "../../lib/format";
import { cn } from "../../lib/cn";

// Adapted from xevrion/ui-lab (MIT) src/lab/components/odometer.tsx.
// Rolling digit wheels for the current price; new scrapes roll forward,
// never spin back. Restyled borderless: no split-flap boxes — the number
// itself is the object, separators (70,891) render as static glyphs.
const GLYPHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function Odometer({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const text = formatNumberIN(Math.max(0, Math.floor(value)));

  // Place values right-to-left across separators: "70,891" → digits keep
  // wheel semantics at 10^k, commas are static.
  const items: Array<{ ch: string; place: number }> = [];
  let place = 1;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    const ch = text.charAt(i);
    if (ch >= "0" && ch <= "9") {
      items.unshift({ ch, place });
      place *= 10;
    } else {
      items.unshift({ ch, place: 0 });
    }
  }

  return (
    <div className={cn("inline-flex items-center font-medium tabular-nums", className)}>
      <output className="sr-only" aria-live="polite">
        {text}
      </output>
      {items.map((item, i) =>
        item.place === 0 ? (
          <span key={i} aria-hidden className="opacity-60">
            {item.ch}
          </span>
        ) : (
          <Wheel key={i} turns={Math.floor(value / item.place)} />
        ),
      )}
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
      className="relative h-[1.15em] w-[0.62em] overflow-hidden"
    >
      <motion.div
        className="absolute inset-0 [mask-image:linear-gradient(transparent,black_18%,black_82%,transparent)]"
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
      className="absolute inset-0 flex items-center justify-center"
      style={{ transform }}
    >
      {digit}
    </motion.span>
  );
}
