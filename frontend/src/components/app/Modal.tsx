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

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
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
  }, [open, onClose]);

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
        >
          <motion.div
            {...rise}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            className={cn(
              "w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-raised outline-hidden",
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
