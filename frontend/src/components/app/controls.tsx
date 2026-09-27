import { cn } from "../../lib/cn";

export function PrimaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary transition-colors outline-hidden hover:bg-primary-strong focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}

export function SecondaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-semibold text-foreground transition-colors outline-hidden hover:border-primary/50 hover:text-primary focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}

export function DangerButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl bg-danger px-5 text-sm font-semibold text-white transition-opacity outline-hidden hover:opacity-90 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block text-sm font-medium text-foreground">
      <span>{label}</span>
      <span className="mt-2 block font-normal">{children}</span>
      {hint && <span className="mt-2 block text-[13px] font-normal text-muted">{hint}</span>}
    </label>
  );
}

export const inputClassName =
  "h-11 w-full rounded-xl border border-border bg-card px-4 text-[15px] text-foreground tabular-nums outline-hidden transition-colors placeholder:text-muted/80 hover:border-primary/40 focus:border-primary focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70";
