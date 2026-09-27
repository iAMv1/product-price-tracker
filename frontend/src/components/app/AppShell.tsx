import { ThemeToggle } from "../ui/theme-toggle";
import { TooltipGroup } from "../ui/tooltip-group";
import { cn } from "../../lib/cn";

export type AppSection = "dashboard" | "search" | "alerts" | "settings";

export interface Crumb {
  label: string;
  href?: string;
}

const LINKS: Array<{
  id: AppSection;
  label: string;
  href: string;
  icon: (className: string) => React.ReactNode;
}> = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "#/app",
    icon: (className) => (
      <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.5 10.5 10 4l6.5 6.5" />
        <path d="M5.5 9.5V16h9V9.5" />
      </svg>
    ),
  },
  {
    id: "search",
    label: "Search Products",
    href: "#/search",
    icon: (className) => (
      <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
        <circle cx="9" cy="9" r="5.2" />
        <path d="m13.2 13.2 3.3 3.3" />
      </svg>
    ),
  },
  {
    id: "alerts",
    label: "Alerts",
    href: "#/alerts",
    icon: (className) => (
      <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 3.2a4.3 4.3 0 0 1 4.3 4.3c0 3 .9 4 1.7 4.7H4c.8-.7 1.7-1.7 1.7-4.7A4.3 4.3 0 0 1 10 3.2Z" />
        <path d="M8.3 15.2a1.8 1.8 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    href: "#/settings",
    icon: (className) => (
      <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
        <circle cx="10" cy="10" r="2.6" />
        <path d="M10 2.8v2.3M10 14.9v2.3M2.8 10h2.3M14.9 10h2.3M4.9 4.9l1.6 1.6M13.5 13.5l1.6 1.6M15.1 4.9l-1.6 1.6M6.5 13.5l-1.6 1.6" />
      </svg>
    ),
  },
];

/**
 * Application shell from the wireframes: desktop sidebar, mobile top bar plus
 * bottom tabs, and one content column. Docs and changelog stay linked from
 * the sidebar so the app never strands the reader.
 */
export function AppShell({
  active,
  crumbs,
  title,
  description,
  actions,
  children,
}: {
  active: AppSection;
  crumbs?: Crumb[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-app text-foreground lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <a href="#/" className="flex items-center gap-2.5 px-5 pt-6 pb-5 outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary">
          <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-bold text-on-primary">
            PT
          </span>
          <span className="text-[17px] font-semibold tracking-tight">PriceTracker</span>
        </a>
        <nav aria-label="Application" className="flex flex-col gap-1 px-3">
          {LINKS.map((link) => {
            const selected = link.id === active;
            return (
              <a
                key={link.id}
                href={link.href}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold outline-hidden transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-primary",
                  selected
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:bg-surface hover:text-foreground",
                )}
              >
                {link.icon("size-5 shrink-0")}
                {link.label}
              </a>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-border px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-muted">Appearance</p>
            <TooltipGroup>
              <ThemeToggle />
            </TooltipGroup>
          </div>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
            <a href="#/docs" className="rounded py-1 hover:text-foreground">Docs</a>
            <a href="#/changelog" className="rounded py-1 hover:text-foreground">Changelog</a>
          </p>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur lg:hidden">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
            <a href="#/app" className="flex items-center gap-2 outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary">
              <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-primary text-[13px] font-bold text-on-primary">
                PT
              </span>
              <span className="text-[15px] font-semibold tracking-tight">PriceTracker</span>
            </a>
            <TooltipGroup>
              <ThemeToggle />
            </TooltipGroup>
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 outline-hidden sm:px-6 lg:pb-12"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {crumbs && crumbs.length > 0 && (
                <nav aria-label="Breadcrumb">
                  <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                    {crumbs.map((crumb, index) => (
                      <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                        {index > 0 && <span aria-hidden>/</span>}
                        {crumb.href ? (
                          <a href={crumb.href} className="rounded py-1 hover:text-foreground">
                            {crumb.label}
                          </a>
                        ) : (
                          <span aria-current="page" className="text-foreground">
                            {crumb.label}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
                {title}
              </h1>
              {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          <div className="mt-6">{children}</div>
        </main>

        <nav
          aria-label="Application"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          <div className="grid grid-cols-4">
            {LINKS.map((link) => {
              const selected = link.id === active;
              return (
                <a
                  key={link.id}
                  href={link.href}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex min-h-[60px] flex-col items-center justify-center gap-1 text-[12px] font-semibold",
                    selected ? "text-primary" : "text-muted",
                  )}
                >
                  {link.icon("size-5")}
                  {link.id === "search" ? "Search" : link.label}
                </a>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
