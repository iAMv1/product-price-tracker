import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/cn";

// Adapted from xevrion/ui-lab (MIT) src/lab/components/context-menu.tsx.
// Kept: portal menu, viewport edge-flip, keyboard map, touch long-press,
// Shift+F10/ContextMenu key, echo swallow, reduced-motion path.
// Dropped: demo canvas styling and seed items — the wrapper takes the
// caller's className; only menu behavior ships.

export type MenuItem = {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  separated?: boolean;
};

type Open = { id: number; x: number; y: number };

// Long enough that a resting thumb or a slow-starting scroll never opens it.
const LONG_PRESS = 500;
// A finger drifting further than this is scrolling, not pressing.
const LONG_PRESS_SLOP = 10;
// Keeps the menu off the very edge of the viewport.
const EDGE = 8;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function ContextMenuArea({
  items,
  onSelect,
  label,
  tabbable = true,
  className,
  children,
}: {
  items: MenuItem[];
  onSelect?: (item: MenuItem) => void;
  label: string;
  // Rows already expose every action through a visible menu button; an extra
  // tab stop per row would tax keyboard users, so rows opt out while keeping
  // right-click, long-press, and Shift+F10 paths.
  tabbable?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [menu, setMenu] = useState<Open | null>(null);
  const nextId = useRef(0);
  const press = useRef<{
    id: number;
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  // The keyboard and a long-press both fire their own contextmenu event
  // right after we have already opened; this swallows that echo.
  const openedAt = useRef(-Infinity);

  useEffect(() => () => clearTimeout(press.current?.timer), []);

  const open = (x: number, y: number) => {
    openedAt.current = performance.now();
    setMenu({ id: ++nextId.current, x, y });
  };

  const openAtCenter = () => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (rect) open(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const cancelPress = () => {
    clearTimeout(press.current?.timer);
    press.current = null;
  };

  const close = (returnFocus: boolean) => {
    setMenu(null);
    if (returnFocus) surfaceRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={surfaceRef}
      tabIndex={tabbable ? 0 : undefined}
      role="group"
      aria-label={label}
      aria-describedby={hintId}
      // React bubbles events from the portalled menu up to here; only the
      // surface's own DOM should open a menu.
      onContextMenu={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.target as Node)) return;
        cancelPress();
        if (performance.now() - openedAt.current < 500) return;
        // A menu key press with no pointer position reports 0,0.
        if (e.clientX === 0 && e.clientY === 0) openAtCenter();
        else open(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (!e.currentTarget.contains(e.target as Node)) return;
        if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
          e.preventDefault();
          openAtCenter();
        }
      }}
      // Mouse and pen get the native contextmenu event; touch needs a hold.
      onPointerDown={(e) => {
        if (e.pointerType !== "touch" || !e.isPrimary) return;
        if (!e.currentTarget.contains(e.target as Node)) return;
        cancelPress();
        const { clientX: x, clientY: y, pointerId: id } = e;
        press.current = {
          id,
          x,
          y,
          timer: setTimeout(() => {
            press.current = null;
            navigator.vibrate?.(10);
            open(x, y);
          }, LONG_PRESS),
        };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || p.id !== e.pointerId) return;
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP) {
          cancelPress();
        }
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      className={cn("outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-primary", className)}
    >
      <span id={hintId} className="sr-only">
        Press Shift F10 or the Menu key for actions
      </span>
      {children}
      <AnimatePresence>
        {menu && (
          <Menu
            key={menu.id}
            x={menu.x}
            y={menu.y}
            items={items}
            label={label}
            onClose={close}
            onSelect={(item) => {
              close(true);
              onSelect?.(item);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Menu({
  x,
  y,
  items,
  label,
  onClose,
  onSelect,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  label: string;
  onClose: (returnFocus: boolean) => void;
  onSelect: (item: MenuItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion();

  // Measures the real menu before the first paint, then flips it to the
  // other side of the pointer when it would overflow and shifts it inward
  // if even that does not fit.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const place = (at: number, size: number, max: number) => {
      const flipped = at + size > max - EDGE ? at - size : at;
      return Math.min(Math.max(flipped, EDGE), max - size - EDGE);
    };
    const left = place(x, w, vw);
    const top = place(y, h, vh);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    const ox = Math.min(Math.max(x - left, 0), w);
    const oy = Math.min(Math.max(y - top, 0), h);
    el.style.transformOrigin = `${ox}px ${oy}px`;
    el.querySelector<HTMLElement>('[role="menuitem"]')?.focus({
      preventScroll: true,
    });
  }, [x, y]);

  useEffect(() => {
    if (!isPresent) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose(false);
    };
    const dismiss = () => onClose(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [isPresent, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) =>
      list[(i + list.length) % list.length]?.focus({ preventScroll: true });
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at < 0 ? -1 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(-1);
    else if (e.key === "Escape" || e.key === "Tab") onClose(true);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse")
          ref.current?.focus({ preventScroll: true });
      }}
      initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.95 }}
      animate={{
        opacity: 1,
        scale: 1,
        transition: { duration: 0.15, ease: EASE_OUT },
      }}
      exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeOut" } }}
      className={cn(
        "fixed top-0 left-0 z-50 w-55 rounded-[14px] border border-border bg-card p-1.5 shadow-raised outline-hidden",
        !isPresent && "pointer-events-none",
      )}
    >
      {items.map((item) => (
        <div key={item.label}>
          {item.separated && (
            <div role="separator" className="mx-2.5 my-1.5 h-px bg-border" />
          )}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={item.disabled || undefined}
            onClick={() => {
              if (!item.disabled) onSelect(item);
            }}
            onPointerMove={(e) => {
              if (
                e.pointerType !== "touch" &&
                document.activeElement !== e.currentTarget
              ) {
                e.currentTarget.focus({ preventScroll: true });
              }
            }}
            className={cn(
              "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm outline-hidden select-none",
              item.disabled
                ? "cursor-default text-muted opacity-60 focus:bg-foreground/[0.04]"
                : item.destructive
                  ? "text-danger focus:bg-danger/10"
                  : "text-foreground focus:bg-foreground/[0.06]",
            )}
          >
            {item.icon && (
              <span aria-hidden className="size-4 shrink-0">
                {item.icon}
              </span>
            )}
            {item.label}
          </button>
        </div>
      ))}
    </motion.div>,
    document.body,
  );
}
