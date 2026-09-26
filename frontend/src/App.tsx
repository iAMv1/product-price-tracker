import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useRoute, type Route } from "./router";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Docs from "./pages/Docs";
import Changelog from "./pages/Changelog";
import Product from "./pages/Product";

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
      >
        Skip to content
      </a>
      <motion.div
        key={route}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {route === "landing" && <Landing />}
        {route === "app" && <Dashboard />}
        {route === "docs" && <Docs />}
        {route === "changelog" && <Changelog />}
        {route === "product" && <Product />}
      </motion.div>
    </>
  );
}
