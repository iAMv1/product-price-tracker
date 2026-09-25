import { ThemeToggle } from "./ui/theme-toggle";

/**
 * Shared sticky nav — one chrome across landing and dashboard (Jakob:
 * same positions, same shapes everywhere; Uniform connectedness: the brand
 * and links tie the pages into one system).
 */
export function SiteNav({ variant }: { variant: "landing" | "app" }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#/" className="text-[15px] font-semibold tracking-tight">
          Price Tracker
        </a>
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          {variant === "landing" && (
            <a href="#/app" className="rounded-full px-3 py-1.5 hover:bg-foreground/10">
              Dashboard
            </a>
          )}
          <a href="#/docs" className="rounded-full px-3 py-1.5 hover:bg-foreground/10">
            Docs
          </a>
          <a href="#/changelog" className="rounded-full px-3 py-1.5 hover:bg-foreground/10">
            Changelog
          </a>
          {variant === "landing" ? (
            <a
              href="#/app"
              className="rounded-full bg-foreground px-4 py-1.5 font-medium text-background"
            >
              Open app
            </a>
          ) : (
            <a
              href="#/"
              className="rounded-full border border-border px-4 py-1.5 font-medium hover:bg-foreground/10"
            >
              Landing
            </a>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

/** Section heading with a hairline rule — structure without a heavy box. */
export function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-[15px] font-semibold text-foreground">{children}</h2>
      <span aria-hidden className="h-px flex-1 bg-border" />
      {right}
    </div>
  );
}
