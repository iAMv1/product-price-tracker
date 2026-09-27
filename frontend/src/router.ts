import { useCallback, useEffect, useState } from "react";

export type Route =
  | "landing"
  | "app"
  | "search"
  | "tracked"
  | "alerts"
  | "settings"
  | "docs"
  | "changelog"
  | "product";

export function parseHash(hash: string): Route {
  const [path] = hash.replace(/^#\/?/, "").split("?");
  const clean = path ?? "";
  if (clean === "app" || clean === "dashboard") return "app";
  if (clean === "search") return "search";
  if (clean === "alerts") return "alerts";
  if (clean === "settings") return "settings";
  if (clean.startsWith("tracked")) return "tracked";
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

/** Tracked-target id from `#/tracked/<id>`; null on any other hash. */
export function parseTrackedId(hash: string): string | null {
  const match = hash.match(/^#\/?tracked\/([^?/#]+)/);
  const id = match?.[1];
  return id ? decodeURIComponent(id) : null;
}

function parseQuery(hash: string): URLSearchParams {
  const query = hash.split("?")[1] ?? "";
  return new URLSearchParams(query.split("#")[0] ?? "");
}

/** Initial search text from `#/search?q=laptop`; empty when absent. */
export function parseSearchQuery(hash: string): string {
  return parseQuery(hash).get("q") ?? "";
}

/** Tab from `#/...?tab=history`; empty when absent. */
export function parseTab(hash: string): string {
  return parseQuery(hash).get("tab") ?? "";
}

export function searchHref(query = ""): string {
  const trimmed = query.trim();
  return trimmed === "" ? "#/search" : `#/search?q=${encodeURIComponent(trimmed)}`;
}

export function productHref(storeProductId: string): string {
  return `#/product/${encodeURIComponent(storeProductId)}`;
}

export function trackedHref(targetId: string, tab?: string): string {
  const base = `#/tracked/${encodeURIComponent(targetId)}`;
  return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
}

/**
 * Minimal hash router: no dependency, deep-linkable.
 * Returns [route, navigate, productId, trackedId]. State is the raw hash
 * string so a same-route id change (`#/product/a` → `#/product/b`) still
 * re-renders.
 */
export function useRoute(): [
  Route,
  (route: Route) => void,
  string | null,
  string | null,
  string,
] {
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
  return [parseHash(hash), go, parseProductId(hash), parseTrackedId(hash), hash];
}

/** Navigate to an explicit hash such as `#/search?q=laptop`. */
export function goHash(hash: string): void {
  window.location.hash = hash;
}
