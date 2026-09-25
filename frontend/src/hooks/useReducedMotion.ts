import { useSyncExternalStore } from 'react';

// Ported pattern from motionforge (app/src/lib/use-reduced-motion.ts):
// report false until hydrated, then the real preference, and follow changes.
const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
