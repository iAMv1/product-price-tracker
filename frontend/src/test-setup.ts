// jsdom does not implement matchMedia; components that read the
// prefers-reduced-motion query get a stable "no preference" answer.
import "@testing-library/jest-dom/vitest";
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
