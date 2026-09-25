import { useCallback, useEffect, useState } from "react";

export type Route = "landing" | "login" | "app" | "docs" | "changelog";

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "").split("?")[0];
  if (clean === "" || clean === "landing") return "landing";
  if (clean === "login") return "login";
  if (clean === "app") return "app";
  if (clean === "docs") return "docs";
  if (clean === "changelog") return "changelog";
  return "landing";
}

/** Minimal hash router: no dependency, deep-linkable, OAuth-safe (#/app). */
export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === "undefined" ? "landing" : parseHash(window.location.hash),
  );
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = useCallback((next: Route) => {
    window.location.hash = `#/${next}`;
  }, []);
  return [route, go];
}
