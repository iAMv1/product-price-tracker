import { useSyncExternalStore } from "react";
import { motion, type Transition } from "motion/react";

// Adapted from xevrion/ui-lab (MIT) src/lab/components/theme-toggle.tsx.
// Pre-paint script lives in index.html; theme state on documentElement.
type Theme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const ICON_TRANSITION: Transition = { type: "spring", duration: 0.3, bounce: 0 };

function subscribe(onChange: () => void) {
  const media = matchMedia(DARK_QUERY);
  const observer = new MutationObserver(onChange);
  media.addEventListener("change", onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => {
    media.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

function getTheme(): Theme {
  const stored = document.documentElement.dataset.theme;
  if (stored === "light" || stored === "dark") return stored;
  return matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  // Without this every color transition on the page fires at once and the
  // switch smears instead of snapping.
  const pause = document.createElement("style");
  pause.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.append(pause);

  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* storage unavailable: theme still applies for this session */
  }

  void document.body.offsetHeight;
  requestAnimationFrame(() => pause.remove());
}

function setTheme(theme: Theme, x: number, y: number) {
  if (
    !document.startViewTransition ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    applyTheme(theme);
    return;
  }

  const radius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  );

  document.startViewTransition(() => applyTheme(theme)).ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${radius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 400,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  });
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => null);
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTheme(next, rect.x + rect.width / 2, rect.y + rect.height / 2);
      }}
      className="relative flex size-9 items-center justify-center rounded-full text-muted transition-[scale,color,background-color] duration-150 ease-out hover:bg-surface hover:text-foreground active:scale-[0.96] motion-reduce:transition-none"
    >
      {theme && (
        <>
          <Icon visible={theme === "light"}>
            <circle cx="8" cy="8" r="2.75" />
            <path d="M8 1.75v1M8 13.25v1M1.75 8h1M13.25 8h1M3.58 3.58l.7.7M11.72 11.72l.7.7M3.58 12.42l.7-.7M11.72 4.28l.7-.7" />
          </Icon>
          <Icon visible={theme === "dark"}>
            <path d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z" />
          </Icon>
        </>
      )}
    </button>
  );
}

function Icon({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.svg
      viewBox="0 0 16 16"
      className="absolute size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      initial={false}
      animate={
        visible
          ? { scale: 1, opacity: 1, filter: "blur(0px)" }
          : { scale: 0.25, opacity: 0, filter: "blur(4px)" }
      }
      transition={ICON_TRANSITION}
    >
      {children}
    </motion.svg>
  );
}
