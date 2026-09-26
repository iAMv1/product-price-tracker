import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/cn";
import { useTooltip } from "./tooltip-group";

// Adapted from xevrion/ui-lab (MIT) src/lab/components/expanding-search.tsx.
// Collapsed circle morphs into the field; `/` opens exactly like a click.
const COLLAPSED = 40;
const EXPAND = { type: "spring", visualDuration: 0.28, bounce: 0 } as const;
const COLLAPSE = { type: "spring", visualDuration: 0.2, bounce: 0 } as const;
const INSTANT = { duration: 0 } as const;
const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const PLACEHOLDER_IN = { duration: 0.15, delay: 0.16, ease: EASE_OUT };
const PLACEHOLDER_OUT = { duration: 0.08, ease: EASE_OUT };

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function ExpandingSearch({
  label = "Search the mock store",
  placeholder = "Product name",
  width = 320,
  shortcut = "/",
  defaultOpen = false,
  onSearch,
  onQueryChange,
  onOpenChange,
  onInputKeyDown,
  inputProps,
  className,
}: {
  label?: string;
  placeholder?: string;
  width?: number;
  shortcut?: string | null;
  /** Render already expanded and never auto-collapse (dashboard task field). */
  defaultOpen?: boolean;
  onSearch?: (query: string) => void;
  onQueryChange?: (query: string) => void;
  onOpenChange?: (open: boolean) => void;
  /** Extra keys handled before the internal Escape/shortcut logic. */
  onInputKeyDown?: (ev: ReactKeyboardEvent<HTMLInputElement>) => void;
  /** aria-* wiring for a parent combobox (role, expanded, activedescendant). */
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const { anchorRef, triggerProps, tooltipProps } = useTooltip("Search products, press /");
  const persistent = defaultOpen;
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [vw, setVw] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Clamp to the viewport minus gutters: a fixed 420px field overflows a
  // 390px phone and pushes the clear button off-screen (WCAG 1.4.10 reflow).
  const fieldWidth = Math.min(width, Math.max(COLLAPSED + 80, vw - 32));
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const change = (next: boolean) => {
    flushSync(() => {
      setOpen(next);
      if (!next) setQuery("");
    });
    onOpenChange?.(next);
  };

  const expand = () => {
    change(true);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== shortcut || e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
      if (rootRef.current?.closest("[inert]")) return;
      e.preventDefault();
      if (open) inputRef.current?.focus();
      else expand();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcut, open]);

  const widthTransition = reduceMotion ? INSTANT : open ? EXPAND : COLLAPSE;
  const hiddenIcon = reduceMotion
    ? { opacity: 0 }
    : { scale: 0.25, opacity: 0, filter: "blur(4px)" };

  return (
    <motion.div
      initial={false}
      animate={{ width: open ? fieldWidth : COLLAPSED }}
      transition={widthTransition}
      className={cn("flex justify-end", className)}
    >
      <motion.form
        ref={rootRef}
        role="search"
        initial={false}
        animate={{ width: open ? fieldWidth : COLLAPSED }}
        transition={widthTransition}
        onSubmit={(e) => {
          e.preventDefault();
          onSearch?.(query);
        }}
        onBlur={(e) => {
          if (!open || persistent || query !== "") return;
          if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
          change(false);
        }}
        className={cn(
          "relative h-10 shrink-0 overflow-hidden rounded-full bg-surface text-foreground shadow-raised transition-[scale] duration-150 ease-out motion-reduce:transition-none",
          "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foreground",
          "[&:has(>[data-trigger]:active)]:scale-[0.96]",
        )}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-3 left-3 size-4 transition-[color] duration-150 ease-out",
            open && "text-muted",
          )}
        >
          <circle cx="7" cy="7" r="4.25" />
          <path d="m10.25 10.25 3 3" />
        </svg>

        <button
          ref={(el) => {
            triggerRef.current = el;
            anchorRef(el);
          }}
          type="button"
          data-trigger
          aria-label={label}
          aria-expanded={open}
          aria-controls={id}
          aria-keyshortcuts={shortcut ?? undefined}
          {...triggerProps}
          onClick={expand}
          className={cn(
            "absolute inset-0 rounded-full outline-hidden",
            open && "invisible",
          )}
        />
        <span {...tooltipProps}>Search products, press /</span>

        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <input
          {...inputProps}
          ref={inputRef}
          id={id}
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onQueryChange?.(e.target.value);
          }}
          onKeyDown={(e) => {
            inputProps?.onKeyDown?.(e);
            if (e.defaultPrevented) return;
            onInputKeyDown?.(e);
            if (e.defaultPrevented) return;
            if (e.key !== "Escape") return;
            e.preventDefault();
            setQuery("");
            onSearch?.("");
            if (persistent) return; // field stays open and focused
            change(false);
            triggerRef.current?.focus();
          }}
          style={{ width: fieldWidth }}
          className={cn(
            "absolute inset-y-0 left-0 bg-transparent pr-10 pl-9 text-sm outline-hidden [&::-webkit-search-cancel-button]:appearance-none",
            !open && "invisible",
          )}
        />
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: open && query === "" ? 1 : 0 }}
          transition={
            query !== ""
              ? INSTANT
              : open
                ? PLACEHOLDER_IN
                : PLACEHOLDER_OUT
          }
          className="pointer-events-none absolute top-1/2 left-9 -translate-y-1/2 text-sm whitespace-nowrap text-muted"
        >
          {placeholder}
        </motion.span>

        <AnimatePresence initial={false}>
          {open && query !== "" && (
            <motion.button
              key="clear"
              type="button"
              aria-label="Clear search"
              initial={hiddenIcon}
              animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
              exit={hiddenIcon}
              transition={ICON_SWAP}
              onClick={() => {
                setQuery("");
                onSearch?.("");
                inputRef.current?.focus();
              }}
              className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full text-muted outline-hidden transition-[color] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                aria-hidden
                className="size-3.5"
              >
                <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.form>
    </motion.div>
  );
}
