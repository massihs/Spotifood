import { cn } from "@/lib/cn";

/**
 * Spotifood mark: a black tile with a green "spot" — the table you scan — and a small bite
 * taken out of it. Wordmark in lowercase, the second "o" echoing the spot.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-ink" />
      <circle cx="16" cy="16" r="8" className="fill-accent" />
      <circle cx="22.2" cy="10.2" r="3.4" className="fill-ink" />
    </svg>
  );
}

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 font-extrabold tracking-tight text-fg", className)}
      dir="ltr"
    >
      <LogoMark className="size-8" />
      {withText ? (
        <span className="latin-digits text-[19px] leading-none">
          spotif<span className="text-accent-text">oo</span>d
        </span>
      ) : null}
    </span>
  );
}
