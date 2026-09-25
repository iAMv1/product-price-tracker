import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/cn";

// Adapted from xevrion/ui-lab (MIT) src/lab/components/relative-time.tsx.
// Rolling digits, hover tooltip with the absolute time, wakes exactly once
// per visible label change. Demo + index-card show dropped.
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const ROLL = { duration: 0.3, ease: [0.32, 0.72, 0, 1] } as const;
const OPEN_DELAY = 400;
const WARM_FOR = 500;
let lastClosedAt = 0;

const tooltipFormat = () =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function label(diff: number, time: number) {
  if (diff < 10 * SEC) return "just now";
  if (diff < MIN) return `${Math.floor(diff / SEC)} sec ago`;
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hr ago`;
  if (diff < 2 * DAY) return "yesterday";
  if (diff < WEEK) return `${Math.floor(diff / DAY)} days ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(time);
}

function untilChange(diff: number) {
  if (diff < 0) return -diff;
  if (diff < 10 * SEC) return 10 * SEC - diff;
  if (diff >= WEEK) return HOUR;
  const unit = diff < MIN ? SEC : diff < HOUR ? MIN : diff < DAY ? HOUR : DAY;
  return unit - (diff % unit);
}

const MAX_TIMEOUT = 2 ** 31 - 1;
const SETTLE_MS = 20;

function useRelativeLabel(time: number | null, now?: number) {
  const pinned = now !== undefined;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (time === null || pinned) return () => {};
      let timer: ReturnType<typeof setTimeout>;
      const schedule = () => {
        const wait = untilChange(Date.now() - time) + SETTLE_MS;
        timer = setTimeout(
          () => {
            notify();
            schedule();
          },
          Math.min(wait, MAX_TIMEOUT),
        );
      };
      schedule();
      const onVisible = () => {
        if (document.visibilityState !== "visible") return;
        clearTimeout(timer);
        notify();
        schedule();
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisible);
      };
    },
    [time, pinned],
  );
  const getSnapshot = useCallback(
    () => (time === null ? null : label((now ?? Date.now()) - time, time)),
    [time, now],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function RelativeTime({
  date,
  now,
  className,
}: {
  date: Date | number | string | null;
  now?: number;
  className?: string;
}) {
  const time = date === null ? null : new Date(date).getTime();
  const text = useRelativeLabel(time, now);
  const reduceMotion = useReducedMotion();
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = (delayed: boolean) => {
    clearTimeout(openTimer.current);
    const warm = Date.now() - lastClosedAt < WARM_FOR;
    if (!delayed || warm) {
      setInstant(warm);
      setOpen(true);
      return;
    }
    setInstant(false);
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  };
  const hide = () => {
    clearTimeout(openTimer.current);
    if (open) lastClosedAt = Date.now();
    setOpen(false);
  };

  const match = text?.match(/^(\d+)(.*)$/);
  const digits = match?.[1] ?? "";
  const rest = match?.[2] ?? text ?? "";

  return (
    <time
      dateTime={time === null ? undefined : new Date(time).toISOString()}
      tabIndex={text === null ? undefined : 0}
      aria-describedby={open ? tipId : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") show(true);
      }}
      onPointerLeave={hide}
      onFocus={() => show(false)}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === "Escape") hide();
      }}
      className={cn(
        "relative inline-flex cursor-default rounded-sm whitespace-nowrap tabular-nums transition-[color] duration-150 ease-out hover:text-foreground focus-visible:text-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground",
        className,
      )}
    >
      {text === null ? (
        <span aria-hidden className="invisible">
          0 min ago
        </span>
      ) : (
        <>
          <span className="sr-only">{text}</span>
          <span aria-hidden className="inline-flex">
            <AnimatePresence initial={false} mode="popLayout">
              {[...digits].map((d, i) => (
                <DigitSlot
                  key={`slot-${digits.length - i}`}
                  digit={d}
                  reduceMotion={reduceMotion}
                />
              ))}
            </AnimatePresence>
            <span className="relative inline-flex">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={rest}
                  className="inline-block whitespace-pre"
                  initial={roll.enter(reduceMotion)}
                  animate={roll.center}
                  exit={roll.exit(reduceMotion)}
                  transition={ROLL}
                >
                  {rest}
                </motion.span>
              </AnimatePresence>
            </span>
          </span>
          <AnimatePresence>
            {open && time !== null ? (
              <Tooltip
                id={tipId}
                time={time}
                instant={instant}
                reduceMotion={reduceMotion}
              />
            ) : null}
          </AnimatePresence>
        </>
      )}
    </time>
  );
}

const roll = {
  enter: (reduce: boolean | null) =>
    reduce ? { opacity: 0 } : { opacity: 0, y: "0.55em", filter: "blur(3px)" },
  center: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: (reduce: boolean | null) =>
    reduce
      ? { opacity: 0 }
      : { opacity: 0, y: "-0.4em", filter: "blur(3px)" },
};

function DigitSlot({
  digit,
  reduceMotion,
}: {
  digit: string;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.span
      className="relative inline-flex"
      initial={roll.enter(reduceMotion)}
      animate={roll.center}
      exit={roll.exit(reduceMotion)}
      transition={ROLL}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={digit}
          className="inline-block"
          initial={roll.enter(reduceMotion)}
          animate={roll.center}
          exit={roll.exit(reduceMotion)}
          transition={ROLL}
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

const VIEWPORT_GUTTER = 8;

function Tooltip({
  id,
  time,
  instant,
  reduceMotion,
}: {
  id: string;
  time: number;
  instant: boolean;
  reduceMotion: boolean | null;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const max = document.documentElement.clientWidth - VIEWPORT_GUTTER;
    const shift =
      r.left < VIEWPORT_GUTTER
        ? VIEWPORT_GUTTER - r.left
        : r.right > max
          ? max - r.right
          : 0;
    el.style.marginLeft = `${Math.round(shift)}px`;
  }, []);

  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 -translate-x-1/2 pb-1.5">
      <motion.span
        ref={ref}
        id={id}
        role="tooltip"
        className="block origin-bottom rounded-md bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background shadow-raised"
        initial={
          instant || reduceMotion
            ? { opacity: instant ? 1 : 0 }
            : { opacity: 0, scale: 0.9, y: 3, filter: "blur(2px)" }
        }
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
          filter: "blur(0px)",
          transition: { duration: instant ? 0 : 0.16, ease: EASE_OUT },
        }}
        exit={{
          opacity: 0,
          scale: reduceMotion ? 1 : 0.97,
          transition: { duration: 0.1, ease: EASE_OUT },
        }}
      >
        {tooltipFormat().format(time)}
      </motion.span>
    </span>
  );
}
