import { useState } from "react";
import { motion } from "motion/react";
import { useAuth } from "../auth/AuthContext";
import { authConfigured } from "../lib/supabase";
import { ThemeToggle } from "../components/ui/theme-toggle";

/** Sign in / create account: email + password plus Google OAuth via Supabase. */
export default function Login({ go }: { go: (r: "app" | "landing") => void }) {
  const { user, loading, error, signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    go("app");
    return null;
  }

  async function submit(kind: "in" | "up") {
    setBusy(true);
    const ok = kind === "in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (ok) go("app");
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-6">
      <header className="flex h-14 items-center justify-between">
        <a href="#/" className="text-[15px] font-semibold tracking-tight">Price Tracker</a>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center py-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-raised sm:p-8"
        >
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "in" ? "Welcome back" : "Create account"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "in"
              ? "Sign in to track products and change cadence."
              : "One account. Same honest dashboard."}
          </p>

          {!authConfigured && (
            <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
              Auth is not configured on this deployment yet. The dashboard stays
              readable; writes need VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
            </p>
          )}

          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            disabled={!authConfigured}
            className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path fill="#EA4335" d="M8 3.5c1.1 0 2 .4 2.7 1l2-2C11.4.6 9.9 0 8 0 4.9 0 2.2 1.8.9 4.4l2.3 1.8C3.9 4.5 5.8 3.5 8 3.5z" />
              <path fill="#4285F4" d="M15.5 8.2c0-.6-.1-1.1-.2-1.7H8v3.1h4.3c-.2 1-1.2 2-2.4 2.4l2.3 1.8c1.4-1.3 2.3-3.2 2.3-5.6z" opacity=".9" />
              <path fill="#FBBC05" d="M3.2 6.2 5.5 8c-.6 1.7.1 3.7 2.5 4.5l-2.3 1.8C2.4 12.4 1.5 8.6 3.2 6.2z" />
              <path fill="#34A853" d="M8 16c2.2 0 4-1.5 4.7-3.4l-2.3-1.8c-.6 1.3-2.4 1.7-4.4.7l-2.3 1.8C4.4 15.2 6.1 16 8 16z" />
            </svg>
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3 text-[12px] text-muted">
            <span className="h-px flex-1 bg-border" />
            or with email
            <span className="h-px flex-1 bg-border" />
          </div>

          <form
            className="grid gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(mode);
            }}
          >
            <label className="grid gap-1 text-sm font-medium">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl border border-border bg-background px-3 font-normal"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Password
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl border border-border bg-background px-3 font-normal"
              />
            </label>
            {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
            <button
              type="submit"
              disabled={busy || !authConfigured}
              className="mt-1 h-11 rounded-full border border-border font-medium hover:bg-foreground/10 disabled:opacity-50"
            >
              {busy ? "Working…" : mode === "in" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
            className="mt-4 w-full text-center text-sm text-muted hover:text-foreground"
          >
            {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
          </button>
        </motion.div>
      </main>
    </div>
  );
}
