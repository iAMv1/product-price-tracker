import { useRef } from "react";
import { cn } from "../../lib/cn";

export interface TabOption {
  id: string;
  label: string;
}

/**
 * Underline tabs from the wireframes. Arrow keys move between tabs; the blue
 * underline marks the current panel.
 */
export function Tabs({
  label,
  tabs,
  value,
  onChange,
  className,
}: {
  label: string;
  tabs: TabOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  function move(current: string, step: number) {
    const index = tabs.findIndex((tab) => tab.id === current);
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (next) {
      onChange(next.id);
      buttons.current.get(next.id)?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("flex gap-1 overflow-x-auto border-b border-border", className)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(value, 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(value, -1);
        } else if (event.key === "Home") {
          event.preventDefault();
          const first = tabs[0];
          if (first) {
            onChange(first.id);
            buttons.current.get(first.id)?.focus();
          }
        } else if (event.key === "End") {
          event.preventDefault();
          const last = tabs[tabs.length - 1];
          if (last) {
            onChange(last.id);
            buttons.current.get(last.id)?.focus();
          }
        }
      }}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              if (element) buttons.current.set(tab.id, element);
              else buttons.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative min-h-11 shrink-0 px-4 text-sm font-semibold whitespace-nowrap outline-hidden transition-colors",
              selected ? "text-primary" : "text-muted hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-primary",
            )}
          >
            {tab.label}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-3 -bottom-px h-0.5 rounded-full",
                selected ? "bg-primary" : "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
