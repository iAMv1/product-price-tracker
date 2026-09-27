import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/cn";

/**
 * Accessible modal shell. The caller owns open state and content; this
 * handles Escape, initial focus, focus return, and scroll locking.
 *
 * Entrance is a 180ms fade + rise (reason: an overlay appearing instantly
 * causes change blindness — the motion marks the layer change). Exits mirror
 * it so dismissal reads as the reverse action, not a disappearance.
 *
 * Two correctness rules:
 * 1. Focus is TRAPPED: Tab/Shift+Tab cycle inside the panel, never escaping
 *    to the page behind. An untrapped modal is a keyboard trap in reverse.
 * 2. The effect depends on `open` only. Callers pass inline `onClose`
 *    closures that change identity every render; depending on them would
 *    tear down and rebuild focus/scroll handling mid-interaction. The latest
 *    onClose is read through a ref instead.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !(event.target instanceof HTMLElement)) return;
      const panel = panelRef.current;
      if (!panel || !panel.contains(event.target)) return;
      // No layout-based visibility filter (offsetParent/getClientRects):
      // jsdom reports no layout, so such a filter would empty the list in
      // tests. Disabled controls are already excluded by the selector, and
      // dialogs never render display:none focusables.
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0] as HTMLElement;
      const last = focusables[focusables.length - 1] as HTMLElement;
      if (event.shiftKey && event.target === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && event.target === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus.current instanceof HTMLElement) {
        previousFocus.current.focus({ preventScroll: true });
      }
    };
  }, [open]);

  const fade = reduce
    ? {}
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] as const },
      };
  const rise = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 12, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 8, scale: 0.98 },
        transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...fade}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          // Clicks that begin on the backdrop must die here: ancestors (row
          // cards) also listen for clicks, and a bubbled backdrop click
          // would re-trigger whatever opened this dialog.
          onClick={(event) => {
            if (event.target === event.currentTarget) event.stopPropagation();
          }}
        >
          <motion.div
            {...rise}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            className={cn(
              "max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-raised outline-hidden",
              className,
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
