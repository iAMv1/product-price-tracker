import { useCallback, useEffect, useState } from "react";

export type Route = "landing" | "app" | "docs" | "changelog" | "product";

export function parseHash(hash: string): Route {
  const [path] = hash.replace(/^#\/?/, "").split("?");
  const clean = path ?? "";
  if (clean === "app") return "app";
  if (clean === "docs") return "docs";
  if (clean === "changelog") return "changelog";
  if (clean.startsWith("product")) return "product";
  return "landing";
}

/** Target id from `#/product/<id>`; null on any other hash. */
export function parseProductId(hash: string): string | null {
  const match = hash.match(/^#\/?product\/([^?/#]+)/);
  const id = match?.[1];
  return id ? decodeURIComponent(id) : null;
}

/**
 * Minimal hash router: no dependency, deep-linkable.
 * Returns [route, navigate, productId]. State is the raw hash string so a
 * same-route id change (`#/product/a` → `#/product/b`) still re-renders.
 */
export function useRoute(): [Route, (route: Route) => void, string | null] {
  const [hash, setHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash,
  );
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = useCallback((next: Route) => {
    window.location.hash = `#/${next}`;
  }, []);
  return [parseHash(hash), go, parseProductId(hash)];
}
