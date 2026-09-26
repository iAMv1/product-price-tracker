// Adapted from xevrion/ui-lab (MIT) src/lab/components/dropdown-menu.tsx.
// Menu grows out of its trigger; press-drag-release selects like a native
// menu; arrow keys + typeahead + Escape handled.
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/cn";

export type DropdownItem =
  | {
      type?: "item";
      label: string;
      icon?: React.ReactNode;
      shortcut?: string;
      destructive?: boolean;
    }
  | { type: "separator" };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const ENTER = { duration: 0.18, ease: EASE_OUT };
const EXIT = { duration: 0.1, ease: EASE_OUT };
const TYPEAHEAD_RESET = 500;

type FocusTarget = "first" | "last" | "menu";

export function DropdownMenu({
  label,
  items,
  align = "start",
  onSelect,
  className,
}: {
  /** Trigger text; also the menu's accessible name. */
  label: React.ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  onSelect?: (label: string) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const triggerId = `${id}-trigger`;
  const menuId = `${id}-menu`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const focusTarget = useRef<FocusTarget>("menu");
  const lastPointerType = useRef("");
  const pressFromTrigger = useRef(false);
  const typeahead = useRef({ query: "", timer: 0 });

  const actionable = items.flatMap((item, i) =>
    item.type === "separator" ? [] : [i],
  );

  const focusItem = (index: number | undefined) => {
    if (index === undefined) return;
    itemRefs.current[index]?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    const target = focusTarget.current;
    if (target === "first") focusItem(actionable[0]);
    else if (target === "last") focusItem(actionable[actionable.length - 1]);
    else menuRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const state = typeahead.current;
    return () => clearTimeout(state.timer);
  }, []);

  const openMenu = (target: FocusTarget) => {
    focusTarget.current = target;
    setActive(-1);
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const select = (index: number) => {
    const item = items[index];
    if (!item || item.type === "separator") return;
    onSelect?.(item.label);
    close(true);
  };

  const move = (step: number) => {
    const at = actionable.indexOf(active);
    const from = at === -1 ? (step > 0 ? -1 : 0) : at;
    const next = (from + step + actionable.length) % actionable.length;
    focusItem(actionable[next]);
  };

  const search = (char: string) => {
    const state = typeahead.current;
    clearTimeout(state.timer);
    state.query += char.toLowerCase();
    state.timer = window.setTimeout(() => {
      state.query = "";
    }, TYPEAHEAD_RESET);
    const repeated = [...state.query].every((c) => c === state.query[0]);
    const query = repeated ? (state.query[0] ?? "") : state.query;
    const at = actionable.indexOf(active);
    const start = repeated ? at + 1 : Math.max(at, 0);
    for (let n = 0; n < actionable.length; n++) {
      const index = actionable[(start + n) % actionable.length];
      if (index === undefined) continue;
      const item = items[index];
      if (item && item.type !== "separator" && item.label.toLowerCase().startsWith(query)) {
        focusItem(index);
        return;
      }
    }
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        return;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        return;
      case "Home":
        e.preventDefault();
        focusItem(actionable[0]);
        return;
      case "End":
        e.preventDefault();
        focusItem(actionable[actionable.length - 1]);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        if (active !== -1) select(active);
        return;
      case "Escape":
        e.preventDefault();
        close(true);
        return;
      case "Tab":
        close(false);
        return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      search(e.key);
    }
  };

  const hidden = { opacity: 0, transform: reduceMotion ? "scale(1)" : "scale(0.95)" };
  const leaving = {
    opacity: 0,
    transform: reduceMotion ? "scale(1)" : "scale(0.97)",
    transition: EXIT,
  };

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onPointerDown={(e) => {
          lastPointerType.current = e.pointerType;
          if (e.pointerType !== "mouse" || e.button !== 0 || e.ctrlKey) return;
          if (open) {
            close(false);
            return;
          }
          e.preventDefault();
          pressFromTrigger.current = true;
          const release = () => {
            pressFromTrigger.current = false;
          };
          window.addEventListener("pointerup", release, { once: true });
          window.addEventListener("pointercancel", release, { once: true });
          openMenu("menu");
        }}
        onClick={() => {
          const pointer = lastPointerType.current;
          lastPointerType.current = "";
          if (pointer === "mouse") return;
          if (open) close(false);
          else openMenu(pointer ? "menu" : "first");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            openMenu("first");
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            openMenu("last");
          }
        }}
        className="flex h-10 touch-manipulation items-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] font-medium text-foreground outline-hidden transition-[scale,background-color] duration-150 ease-out select-none hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-none"
      >
        {label}
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={cn(
            "size-4 text-muted transition-[rotate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
            open && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <Panel
            ref={menuRef}
            id={menuId}
            labelledBy={triggerId}
            align={align}
            initial={hidden}
            exit={leaving}
            onKeyDown={onMenuKeyDown}
            onPointerLeave={(e) => {
              if (e.pointerType === "touch" || active === -1) return;
              menuRef.current?.focus({ preventScroll: true });
              setActive(-1);
            }}
            onBlur={(e) => {
              if (!rootRef.current?.contains(e.relatedTarget as Node | null)) {
                close(false);
              }
            }}
          >
            {items.map((item, i) => {
              if (item.type === "separator") {
                return <div key={`separator-${i}`} role="separator" className="-mx-1 my-1 h-px bg-border" />;
              }
              const highlighted = active === i;
              return (
                <div
                  key={item.label}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  role="menuitem"
                  tabIndex={-1}
                  onFocus={() => setActive(i)}
                  onPointerMove={(e) => {
                    if (e.pointerType === "touch" || highlighted) return;
                    focusItem(i);
                  }}
                  onPointerUp={() => {
                    if (pressFromTrigger.current) select(i);
                  }}
                  onClick={() => select(i)}
                  className={cn(
                    "flex h-9 cursor-default items-center gap-2.5 rounded-lg px-2 text-sm outline-hidden select-none",
                    item.destructive ? "text-danger" : "text-foreground",
                    highlighted && (item.destructive ? "bg-danger/10" : "bg-foreground/[0.06]"),
                  )}
                >
                  {item.icon && (
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0",
                        !item.destructive && !highlighted && "text-muted",
                      )}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {item.icon}
                    </svg>
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.shortcut && (
                    <kbd
                      className={cn(
                        "font-sans text-xs tracking-wide",
                        item.destructive ? "text-danger/70" : "text-muted",
                      )}
                    >
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })}
          </Panel>
        )}
      </AnimatePresence>
    </div>
  );
}

function Panel({
  ref,
  id,
  labelledBy,
  align,
  initial,
  exit,
  onKeyDown,
  onPointerLeave,
  onBlur,
  children,
}: {
  ref: React.Ref<HTMLDivElement>;
  id: string;
  labelledBy: string;
  align: "start" | "end";
  initial: { opacity: number; transform: string };
  exit: { opacity: number; transform: string; transition: typeof EXIT };
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onBlur: (e: React.FocusEvent) => void;
  children: React.ReactNode;
}) {
  const isPresent = useIsPresent();
  return (
    <motion.div
      ref={ref}
      id={id}
      role="menu"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      initial={initial}
      animate={{ opacity: 1, transform: "scale(1)" }}
      exit={exit}
      transition={ENTER}
      onKeyDown={onKeyDown}
      onPointerLeave={onPointerLeave}
      onBlur={onBlur}
      style={{ transformOrigin: align === "end" ? "top right" : "top left" }}
      className={cn(
        "absolute top-full z-50 mt-1.5 w-52 rounded-xl bg-surface p-1 shadow-raised outline-hidden",
        align === "end" ? "right-0" : "left-0",
        !isPresent && "pointer-events-none",
      )}
    >
      {children}
    </motion.div>
  );
}
