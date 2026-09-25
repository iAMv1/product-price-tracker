import { useEffect } from "react";
import { motion } from "motion/react";
import { AuthProvider } from "./auth/AuthContext";
import { useRoute } from "./router";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Docs from "./pages/Docs";
import Changelog from "./pages/Changelog";

/** Shell: auth session, hash routes, scroll reset, route fade. */
export default function App() {
  const [route, go] = useRoute();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);
  return (
    <AuthProvider>
      <motion.div
        key={route}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {route === "landing" && <Landing />}
        {route === "login" && <Login go={go} />}
        {route === "app" && <Dashboard />}
        {route === "docs" && <Docs />}
        {route === "changelog" && <Changelog />}
      </motion.div>
    </AuthProvider>
  );
}
