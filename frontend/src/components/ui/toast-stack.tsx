// Adapted from xevrion/ui-lab (MIT) src/lab/components/toast-stack.tsx.
// Fanned stack, drain-timer edge, pause on hover/tab. Module store so any
// component can fire a toast without a provider.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { cn } from "../../lib/cn";

type Toast = { id: number; title: string; description: string };

const HEIGHT = 64;
const GAP = 8;
const PEEK = 12;
const SHRINK = 0.05;
const VISIBLE = 3;
const DURATION = 4000;
const LEAVE_MS = 200;
const FLICK_VELOCITY = 0.11;
const DISMISS_DISTANCE = 40;

const CSS = `
@keyframes toast-drain {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -1; }
}
.toast-drain { animation: toast-drain ${DURATION}ms linear forwards; }
`;

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [leaving, setLeaving] = useState<Map<number, number>>(new Map());
  const remaining = useRef(new Map<number, number>());

  const dismiss = useCallback(
    (id: number, index: number) => {
      setLeaving((m) => new Map(m).set(id, index));
      setTimeout(() => {
        onDismiss(id);
        setLeaving((m) => {
          const next = new Map(m);
          next.delete(id);
          return next;
        });
        remaining.current.delete(id);
      }, LEAVE_MS);
    },
    [onDismiss],
  );

  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  const live = useMemo(
    () => toasts.filter((t) => !leaving.has(t.id)).reverse(),
    [toasts, leaving],
  );

  useEffect(() => {
    if (hovered || hidden) return;
    const left = remaining.current;
    const started = performance.now();
    const timers = live.map((t) =>
      setTimeout(() => dismiss(t.id, 0), left.get(t.id) ?? DURATION),
    );
    return () => {
      timers.forEach(clearTimeout);
      const spent = performance.now() - started;
      for (const t of live) {
        left.set(t.id, (left.get(t.id) ?? DURATION) - spent);
      }
    };
  }, [live, hovered, hidden, dismiss]);

  const expandedHeight = live.length * (HEIGHT + GAP) - GAP;

  return (
    <section
      aria-label="Notifications"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 w-[356px] max-w-[calc(100vw-2rem)] -translate-x-1/2"
    >
      <style>{CSS}</style>
      <ol
        className="relative"
        style={{ height: hovered ? Math.max(expandedHeight, HEIGHT) : HEIGHT }}
        onPointerEnter={(e) => {
          if (e.pointerType !== "touch") setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
      >
        {toasts.map((toast) => {
          const leaveIndex = leaving.get(toast.id);
          const index = leaveIndex ?? live.indexOf(toast);
          return (
            <ToastItem
              key={toast.id}
              toast={toast}
              index={index}
              expanded={hovered}
              paused={hovered || hidden}
              leaving={leaveIndex !== undefined}
              onDismiss={() => dismiss(toast.id, index)}
            />
          );
        })}
      </ol>
    </section>
  );
}

function ToastItem({
  toast,
  index,
  expanded,
  paused,
  leaving,
  onDismiss,
}: {
  toast: Toast;
  index: number;
  expanded: boolean;
  paused: boolean;
  leaving: boolean;
  onDismiss: () => void;
}) {
  const drag = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    axis: "x" | "y" | null;
    distance: number;
  }>(null);

  const y = expanded ? -index * (HEIGHT + GAP) : -index * PEEK;
  const scale = expanded ? 1 : 1 - index * SHRINK;
  const opacity = leaving || index >= VISIBLE ? 0 : 1;

  return (
    <li
      className={cn(
        "absolute inset-x-0 bottom-0 flex h-16 touch-none flex-col justify-center rounded-2xl bg-background px-4 shadow-raised select-none",
        "[transform:translateY(var(--y))_scale(var(--scale))] opacity-(--opacity) transition-[transform,opacity,translate,filter] duration-400 ease-[ease] starting:[transform:translateY(100%)] starting:opacity-0",
        leaving && "blur-[4px] duration-200 ease-out",
        "border border-border",
        "motion-reduce:transition-[opacity]",
      )}
      style={
        {
          "--y": `${y + (leaving ? 12 : 0)}px`,
          "--scale": scale,
          "--opacity": opacity,
          zIndex: 100 - index,
        } as CSSProperties
      }
      onPointerDown={(e) => {
        if (e.button !== 0 || leaving) return;
        drag.current = {
          startX: e.clientX,
          startY: e.clientY,
          startTime: performance.now(),
          axis: null,
          distance: 0,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.style.transitionProperty = "transform, opacity";
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.axis) {
          if (Math.hypot(dx, dy) < 4) return;
          d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        }
        if (d.axis === "x") {
          d.distance = dx;
          e.currentTarget.style.translate = `${dx}px 0`;
        } else {
          d.distance = dy < 0 ? -Math.pow(-dy, 0.5) : dy;
          e.currentTarget.style.translate = `0 ${d.distance}px`;
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        e.currentTarget.style.transitionProperty = "";
        const reach = d.axis === "x" ? Math.abs(d.distance) : d.distance;
        const velocity = reach / (performance.now() - d.startTime);
        if (reach > DISMISS_DISTANCE || velocity > FLICK_VELOCITY) {
          if (d.axis === "x") {
            e.currentTarget.style.translate = `${Math.sign(d.distance) * 100}% 0`;
          }
          onDismiss();
        } else {
          e.currentTarget.style.translate = "";
        }
      }}
      onPointerCancel={(e) => {
        drag.current = null;
        e.currentTarget.style.transitionProperty = "";
        e.currentTarget.style.translate = "";
      }}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full overflow-visible text-foreground"
      >
        <rect
          x="0.5"
          y="0.5"
          rx="15.5"
          style={{
            width: "calc(100% - 1px)",
            height: "calc(100% - 1px)",
            animationPlayState: paused ? "paused" : "running",
          }}
          pathLength={1}
          strokeDasharray="1 1"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.35}
          className="toast-drain"
        />
      </svg>
      <p className="text-sm font-medium text-foreground">{toast.title}</p>
      <p className="truncate text-sm text-muted">{toast.description}</p>
    </li>
  );
}

/** Module store: toast("Scrape complete", "New observation recorded"). */
let items: Toast[] = [];
let nextId = 0;
const listeners = new Set<() => void>();
function emit() {
  for (const listener of listeners) listener();
}

export function toast(title: string, description = "") {
  items = [...items.slice(-(VISIBLE + 1)), { id: nextId++, title, description }];
  emit();
}

function remove(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function Toaster() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
    () => items,
  );
  return <ToastStack toasts={snapshot} onDismiss={remove} />;
}
