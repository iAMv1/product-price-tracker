import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

/**
 * Theme toggle. Pattern ported from motionforge's theme-toggle, minus the
 * motion dependency: sun/moon swap via CSS, instant switch under
 * prefers-reduced-motion, persisted to localStorage with a pre-paint script
 * in index.html so no flash occurs. The icons swap with a scale/fade CSS
 * transition (disabled when reduced motion is preferred).
 */
const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void): () => void {
  const media = matchMedia(DARK_QUERY);
  const observer = new MutationObserver(onChange);
  media.addEventListener('change', onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => {
    media.removeEventListener('change', onChange);
    observer.disconnect();
  };
}

function getTheme(): Theme | null {
  const stored = document.documentElement.dataset.theme;
  if (stored === 'light' || stored === 'dark') return stored;
  return null;
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => null);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      aria-label={`Switch to ${next} theme`}
      onClick={() => applyTheme(next)}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className={`theme-icon ${theme === 'light' ? 'is-visible' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      >
        <circle cx="8" cy="8" r="2.75" />
        <path d="M8 1.75v1M8 13.25v1M1.75 8h1M13.25 8h1M3.58 3.58l.7.7M11.72 11.72l.7.7M3.58 12.42l.7-.7M11.72 4.28l.7-.7" />
      </svg>
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className={`theme-icon ${theme === 'dark' ? 'is-visible' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z" />
      </svg>
    </button>
  );
}
