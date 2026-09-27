import { useId } from "react";
import { cn } from "../../lib/cn";
import { productInitials } from "../../lib/ids";
/** Product monogram tile. The store API supplies no images, so initials stand in. */
export function ProductMark({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "size-10 text-sm",
    md: "size-12 text-base",
    lg: "size-20 text-2xl",
  } as const;
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-xl border border-border bg-surface font-semibold text-foreground/70",
        sizes[size],
        className,
      )}
    >
      {productInitials(name)}
    </span>
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      {...props}
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-raised sm:p-6",
        className,
      )}
    />
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // h2, not p: every eyebrow labels a section, so the outline stays
    // h1 (page) → h2 (sections) with no skips.
    <h2
      className={cn(
        "text-xs font-semibold tracking-widest text-muted uppercase",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function UnavailableNote({ children }: { children: React.ReactNode }) {
  const id = useId();
  return (
    <p id={id} className="mt-2 text-[13px] leading-relaxed text-muted">
      {children}
    </p>
  );
}
