import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/cn";

type Point = { label: string; value: number };

// Adapted from xevrion/ui-lab (MIT) src/lab/components/sparkline.tsx.
// Draw-once line, pointer scrubber with tooltip, full keyboard path, and a
// screen-reader table. Demo + seeded data dropped; the chart is the export.
const W = 520;
const H = 160;
const PAD_X = 8;
const PAD_Y = 10;
const DRAW = { duration: 0.7, ease: [0.23, 1, 0.32, 1] } as const;

export function Sparkline({
  data,
  title,
  format = (v) => String(v),
  className,
}: {
  data: Point[];
  title: string;
  format?: (value: number) => string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const plotRef = useRef<HTMLDivElement>(null);
  const inView = useInView(plotRef, { once: true });
  const [index, setIndex] = useState(data.length - 1);
  const [active, setActive] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // Rescrapes replace the dataset: clamp the scrubber into the new range
  // instead of pointing past its end.
  useEffect(() => {
    setIndex((i) => Math.min(Math.max(i, 0), Math.max(data.length - 1, 0)));
  }, [data.length]);

  if (data.length === 0) return null;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (W - PAD_X * 2) / Math.max(data.length - 1, 1);
  const xAt = (i: number) => PAD_X + i * step;
  const yAt = (v: number) => PAD_Y + (1 - (v - min) / span) * (H - PAD_Y * 2);

  const line = data
    .map((d, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)} ${yAt(d.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${xAt(data.length - 1)} ${H} L${xAt(0)} ${H} Z`;

  const first = data[0];
  const last = data[data.length - 1];
  if (first === undefined || last === undefined) return null;
  const delta = last.value - first.value;

  const nearest = (clientX: number) => {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box) return index;
    const x = ((clientX - box.left) / box.width) * W;
    return Math.min(Math.max(Math.round((x - PAD_X) / step), 0), data.length - 1);
  };

  const describe = (i: number) => {
    const point = data[i];
    return point === undefined ? "" : `${point.label}: ${format(point.value)}`;
  };

  const point = data[index];
  if (point === undefined) return null;
  const x = xAt(index);
  const y = yAt(point.value);
  const tipX = Math.min(Math.max(x, 72), W - 72);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div className={cn("w-[520px] max-w-full", className)}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-data text-[11px] tracking-[0.14em] text-muted uppercase">
            {title}
          </p>
          <p className="font-data mt-1 text-[26px] leading-none font-semibold tracking-tight text-foreground tabular-nums">
            {format(last.value)}
          </p>
        </div>
        {/* Delta as a boxed annotation — mono, tabular, red only on a drop. */}
        <p
          className={cn(
            "font-data border border-border px-2 py-1 text-[12px] leading-none whitespace-nowrap",
            delta < 0
              ? "text-marker"
              : delta > 0
                ? "text-foreground"
                : "text-muted",
          )}
        >
          <span className="font-semibold tabular-nums">
            {delta > 0 ? "+" : delta < 0 ? "-" : ""}
            {format(Math.abs(delta))}
          </span>{" "}
          vs {first.label}
        </p>
      </div>

      <div
        ref={plotRef}
        role="group"
        tabIndex={0}
        aria-roledescription="line chart"
        aria-label={`${title}, ${data.length} points. Use arrow keys to read values.`}
        className="relative mt-6 aspect-[520/160] w-full touch-pan-y rounded-sm outline-hidden select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-foreground"
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          setIndex(nearest(e.clientX));
          setActive(true);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "touch" && !active) return;
          setIndex(nearest(e.clientX));
          setActive(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "touch") setActive(false);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === "touch") setActive(false);
        }}
        onPointerCancel={() => setActive(false)}
        onFocus={() => {
          setActive(true);
          setAnnouncement(describe(index));
        }}
        onBlur={() => setActive(false)}
        onKeyDown={(e) => {
          const next = {
            ArrowLeft: index - 1,
            ArrowRight: index + 1,
            Home: 0,
            End: data.length - 1,
          }[e.key];
          if (next === undefined) return;
          e.preventDefault();
          const clamped = Math.min(Math.max(next, 0), data.length - 1);
          setIndex(clamped);
          setActive(true);
          setAnnouncement(describe(clamped));
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full overflow-visible"
          aria-hidden
        >
          {/* Instrument frame: hairline at max, mid, min — the chart sits in
              a measured space instead of floating on the page. */}
          <line x1={PAD_X} x2={W - PAD_X} y1={PAD_Y} y2={PAD_Y} className="stroke-border" />
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={(PAD_Y + (H - PAD_Y)) / 2}
            y2={(PAD_Y + (H - PAD_Y)) / 2}
            className="stroke-border"
            strokeDasharray="2 4"
          />
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={H - PAD_Y}
            y2={H - PAD_Y}
            className="stroke-border"
          />
          <text
            x={W - PAD_X}
            y={PAD_Y - 3}
            textAnchor="end"
            className="font-data fill-muted text-[9px] tabular-nums"
          >
            {format(max)}
          </text>
          <text
            x={W - PAD_X}
            y={H - PAD_Y + 10}
            textAnchor="end"
            className="font-data fill-muted text-[9px] tabular-nums"
          >
            {format(min)}
          </text>
          <motion.path
            d={area}
            className="fill-foreground/[0.08]"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : undefined}
            transition={DRAW}
          />
          <motion.path
            d={line}
            fill="none"
            className="stroke-foreground"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={inView ? { pathLength: 1, opacity: 1 } : undefined}
            transition={
              reduceMotion
                ? { pathLength: { duration: 0 }, opacity: DRAW }
                : { pathLength: DRAW, opacity: { duration: 0.05 } }
            }
          />
          {/* Every fall from the previous observation gets a red marker —
              the one accent, spent only where the price actually dropped. */}
          {data.map((d, i) =>
            i > 0 && d.value < data[i - 1]!.value ? (
              <circle
                key={`drop-${i}`}
                cx={xAt(i)}
                cy={yAt(d.value)}
                r={3}
                className="fill-background stroke-marker"
                strokeWidth={1.5}
              />
            ) : null,
          )}
          {/* The reading at rest: last point, always marked. */}
          <circle
            cx={xAt(data.length - 1)}
            cy={yAt(last.value)}
            r={3.5}
            className="fill-foreground"
          />
        </svg>

        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity ease-out",
            active ? "opacity-100 duration-100" : "opacity-0 duration-150",
          )}
        >
          <div
            className="absolute top-0 h-full w-px -translate-x-1/2 bg-muted/40"
            style={{ left: pct(x, W) }}
          />
          <div
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-background"
            style={{ left: pct(x, W), top: pct(y, H) }}
          />
          <div
            className="absolute bottom-full mb-2.5 flex -translate-x-1/2 items-baseline gap-2 rounded-full bg-foreground px-3 py-1.5 text-sm whitespace-nowrap text-background"
            style={{ left: pct(tipX, W) }}
          >
            <span className="font-semibold tabular-nums">{format(point.value)}</span>
            <span className="opacity-70">{point.label}</span>
          </div>
        </div>
      </div>

      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Observed</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={`${d.label}-${i}`}>
                <th scope="row">{d.label}</th>
                <td>{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
