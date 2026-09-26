import { lazy, Suspense, useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useRoute, type Route } from "./router";
import Landing from "./pages/Landing";
import { Toaster } from "./components/ui/toast-stack";

// Route-level splitting: only the landing shell ships up front; dashboard,
// product, docs and changelog load on navigation (fixes the >500 kB warning).
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Docs = lazy(() => import("./pages/Docs"));
const Changelog = lazy(() => import("./pages/Changelog"));
const Product = lazy(() => import("./pages/Product"));

function RouteLoading() {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 py-24 text-center"
      role="status"
    >
      <p className="text-sm text-muted">Loading…</p>
    </div>
  );
}

const TITLES: Record<Route, string> = {
  landing: "Product Price Tracker — honest price history",
  app: "Dashboard — Product Price Tracker",
  docs: "Docs — Product Price Tracker",
  changelog: "Changelog — Product Price Tracker",
  product: "Quick view — Product Price Tracker",
};

/** Shell: hash routes, titles, skip link, focus reset, route fade. */
export default function App() {
  const [route] = useRoute();
  const reduce = useReducedMotion();
  useEffect(() => {
    document.title = TITLES[route];
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [route]);
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:text-background"
        onClick={(ev) => {
          // Move focus WITHOUT writing the hash: a raw href="#main" would hit
          // parseHash's landing fallback and eject the current route.
          ev.preventDefault();
          const target = document.getElementById("main");
          if (!target) return;
          target.focus({ preventScroll: true });
          target.scrollIntoView({ block: "start" });
        }}
      >
        Skip to content
      </a>
      <motion.div
        key={route}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <Suspense fallback={<RouteLoading />}>
          {route === "landing" && <Landing />}
          {route === "app" && <Dashboard />}
          {route === "docs" && <Docs />}
          {route === "changelog" && <Changelog />}
          {route === "product" && <Product />}
        </Suspense>
      </motion.div>
      <Toaster />
    </>
  );
}
