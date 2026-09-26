// Adapted from xevrion/ui-lab (MIT) src/lab/components/tooltip-group.tsx.
// One shared clock and one shared bubble for every tooltip in a group:
// scanning a toolbar slides the same bubble instead of swapping tooltips.
// Requires a <TooltipGroup> ancestor; triggers describe themselves to AT.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type Variants,
} from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/cn";

type Open = { id: string; instant: boolean } | null;
type Shown = { id: string; content: React.ReactNode; dir: number };
type Anchor = { el: HTMLElement | null; content: React.ReactNode };

type Group = {
  open: Open;
  anchors: React.RefObject<Map<string, Anchor>>;
  request: (id: string, immediate: boolean) => void;
  release: (id: string) => void;
  dismiss: (id: string) => void;
};

const GroupContext = createContext<Group | null>(null);

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const GLIDE = { type: "spring", visualDuration: 0.22, bounce: 0.12 } as const;
const RESHAPE = { type: "spring", visualDuration: 0.22, bounce: 0 } as const;
const OFFSET = 10;
const PAD_X = 24;
const STILL_VISIBLE = 110;

const LABEL: Variants = {
  enter: ({ dir, reduce }: { dir: number; reduce: boolean }) => ({
    opacity: 0,
    x: reduce ? 0 : dir * 10,
    filter: reduce ? "blur(0px)" : "blur(4px)",
  }),
  center: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.2, ease: EASE_OUT },
  },
  exit: ({ dir, reduce }: { dir: number; reduce: boolean }) => ({
    opacity: 0,
    x: reduce ? 0 : dir * -6,
    filter: reduce ? "blur(0px)" : "blur(2px)",
    transition: { duration: 0.12, ease: EASE_OUT },
  }),
};

export function TooltipGroup({
  delay = 500,
  skipDelay = 300,
  className,
  children,
}: {
  delay?: number;
  skipDelay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const [open, setOpenState] = useState<Open>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const openRef = useRef<Open>(null);
  const shownId = useRef<string | null>(null);
  const closedAt = useRef(-Infinity);
  const warm = useRef(false);
  const pending = useRef<string | null>(null);
  const suppressed = useRef<string | null>(null);
  const delayTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const graceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const anchors = useRef(new Map<string, Anchor>());

  const root = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const width = useMotionValue(0);
  const lastOpen = useRef<Open>(null);

  const center = (id: string | null) => {
    const box = id ? anchors.current.get(id)?.el?.getBoundingClientRect() : null;
    return box ? box.left + box.width / 2 : null;
  };

  const setOpen = useCallback((next: Open) => {
    const previous = openRef.current;
    openRef.current = next;
    setOpenState(next);
    if (!next) {
      if (previous) closedAt.current = performance.now();
      return;
    }
    const from = center(shownId.current);
    const to = center(next.id);
    shownId.current = next.id;
    setShown({
      id: next.id,
      content: anchors.current.get(next.id)?.content,
      dir: from === null || to === null ? 0 : Math.sign(to - from),
    });
  }, []);

  useLayoutEffect(() => {
    const wasOpen = lastOpen.current !== null;
    lastOpen.current = open;
    const el = open ? anchors.current.get(open.id)?.el : null;
    const box = root.current?.getBoundingClientRect();
    if (!open || !el || !box || !measure.current) return;
    const target = el.getBoundingClientRect();
    const tx = target.left + target.width / 2 - box.left;
    const ty = target.top - box.top - OFFSET;
    const tw = measure.current.offsetWidth + PAD_X;
    const onScreen = wasOpen || performance.now() - closedAt.current < STILL_VISIBLE;
    if (!onScreen || reduceMotion) {
      x.jump(tx);
      y.jump(ty);
      width.jump(tw);
      return;
    }
    animate(x, tx, GLIDE);
    animate(y, ty, GLIDE);
    animate(width, tw, RESHAPE);
  }, [open, shown, reduceMotion, x, y, width]);

  useEffect(
    () => () => {
      x.stop();
      y.stop();
      width.stop();
    },
    [x, y, width],
  );

  useEffect(
    () => () => {
      clearTimeout(delayTimer.current);
      clearTimeout(graceTimer.current);
    },
    [],
  );

  const request = useCallback(
    (id: string, immediate: boolean) => {
      if (suppressed.current === id) return;
      clearTimeout(delayTimer.current);
      clearTimeout(graceTimer.current);
      pending.current = null;
      if (warm.current || openRef.current) {
        setOpen({ id, instant: true });
        return;
      }
      if (immediate) {
        warm.current = true;
        setOpen({ id, instant: false });
        return;
      }
      pending.current = id;
      delayTimer.current = setTimeout(() => {
        pending.current = null;
        warm.current = true;
        setOpen({ id, instant: false });
      }, delay);
    },
    [delay, setOpen],
  );

  const release = useCallback(
    (id: string) => {
      if (suppressed.current === id) suppressed.current = null;
      if (pending.current === id) {
        clearTimeout(delayTimer.current);
        pending.current = null;
      }
      if (openRef.current && openRef.current.id !== id) return;
      if (openRef.current) setOpen(null);
      if (!warm.current) return;
      clearTimeout(graceTimer.current);
      graceTimer.current = setTimeout(() => {
        warm.current = false;
      }, skipDelay);
    },
    [skipDelay, setOpen],
  );

  const dismiss = useCallback(
    (id: string) => {
      if (pending.current === id) {
        clearTimeout(delayTimer.current);
        pending.current = null;
      }
      suppressed.current = id;
      if (openRef.current?.id === id) setOpen(null);
    },
    [setOpen],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss(open.id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  const value = useMemo(
    () => ({ open, anchors, request, release, dismiss }),
    [open, request, release, dismiss],
  );
  const custom = { dir: shown?.dir ?? 0, reduce: reduceMotion };

  return (
    <GroupContext.Provider value={value}>
      <div ref={root} className={cn("relative w-fit max-w-full", className)}>
        {children}
        <motion.div
          aria-hidden
          style={{ x, y, width }}
          className={cn(
            "pointer-events-none absolute top-0 left-0 z-10 h-7 origin-bottom -translate-x-1/2 -translate-y-full",
            "transition-[opacity,scale] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:scale-100",
            open ? "scale-100 opacity-100 duration-150" : "scale-[0.97] opacity-0 duration-100",
            open?.instant && "duration-0",
          )}
        >
          <div className="relative size-full overflow-hidden rounded-full bg-foreground text-[13px] font-medium text-background">
            <AnimatePresence initial={false} custom={custom}>
              {shown && (
                <motion.span
                  key={shown.id}
                  custom={custom}
                  variants={LABEL}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="absolute inset-0 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {shown.content}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <span className="absolute top-full left-1/2 -ml-[5px] block border-x-[5px] border-t-[5px] border-x-transparent border-t-foreground" />
        </motion.div>
        <span
          ref={measure}
          aria-hidden
          className="invisible absolute top-0 left-0 flex gap-2 text-[13px] font-medium whitespace-nowrap"
        >
          {shown?.content}
        </span>
      </div>
    </GroupContext.Provider>
  );
}

/** Attach one control to its group's sliding bubble. */
export function useTooltip(content?: React.ReactNode) {
  const group = useContext(GroupContext);
  if (!group) throw new Error("useTooltip needs a <TooltipGroup> above it");
  const { open, anchors, request, release, dismiss } = group;
  const id = useId();
  const isOpen = open?.id === id;
  const el = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    anchors.current.set(id, { el: el.current, content });
  });
  useEffect(() => {
    const map = anchors.current;
    return () => {
      map.delete(id);
    };
  }, [anchors, id]);

  return {
    isOpen,
    anchorRef: (node: HTMLElement | null) => {
      el.current = node;
    },
    triggerProps: {
      "aria-describedby": id,
      onPointerEnter: (e: React.PointerEvent) => {
        if (e.pointerType !== "touch") request(id, false);
      },
      onPointerLeave: (e: React.PointerEvent) => {
        if (e.pointerType !== "touch") release(id);
      },
      onPointerDown: () => dismiss(id),
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        if (e.currentTarget.matches(":focus-visible")) request(id, true);
      },
      onBlur: () => release(id),
    },
    tooltipProps: { id, role: "tooltip" as const, hidden: true },
  };
}
