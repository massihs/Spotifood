import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Spotifood mark: a white plate on a dark tile, an orange "spot" with a bite on it — the table
 * you scan, the food — and the plate's rim that reads as a record: Spotifood plays music too.
 * Same drawing as the app icons (scripts/generate-brand.mjs), simplified for small sizes.
 * Brand colours are fixed: the mark looks the same whatever the restaurant's colour.
 */
export function LogoMark({ className }: { className?: string }) {
  // One set of ids per mark: a shared id points at the first copy, which may sit in a hidden
  // sidebar (display: none) and then paints nothing.
  const id = `sf-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <defs>
        <linearGradient id={`${id}-t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#262626" />
          <stop offset="1" stopColor="#0d0d0d" />
        </linearGradient>
        <radialGradient id={`${id}-p`} cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.72" stopColor="#fcfaf7" />
          <stop offset="1" stopColor="#ece3db" />
        </radialGradient>
        <linearGradient id={`${id}-s`} x1="0.18" y1="0.08" x2="0.82" y2="0.96">
          <stop offset="0" stopColor="#ff9b30" />
          <stop offset="0.5" stopColor="#f06a0c" />
          <stop offset="1" stopColor="#d63f1e" />
        </linearGradient>
        <mask id={`${id}-b`}>
          <rect width="32" height="32" fill="#fff" />
          <circle cx="19.9" cy="12.15" r="1.95" fill="#000" />
          <circle cx="18.15" cy="10.9" r="1.07" fill="#000" />
          <circle cx="21.2" cy="13.95" r="1.07" fill="#000" />
        </mask>
      </defs>
      <rect width="32" height="32" rx="7.25" fill={`url(#${id}-t)`} />
      <rect
        x="0.25"
        y="0.25"
        width="31.5"
        height="31.5"
        rx="7"
        fill="none"
        className="stroke-transparent dark:stroke-white/14"
        strokeWidth="0.5"
      />
      <circle cx="16" cy="16" r="10.3" fill={`url(#${id}-p)`} />
      <circle cx="16" cy="16" r="8.35" fill="none" stroke="#e5d9cf" strokeWidth="0.55" />
      <circle cx="16" cy="16" r="5.25" fill={`url(#${id}-s)`} mask={`url(#${id}-b)`} />
    </svg>
  );
}

/** The mark and the "spotifood" wordmark: "spoti" in the text colour, "food" in the brand orange. */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg", className)} dir="ltr">
      <LogoMark className="size-8" />
      {withText ? (
        <span className="latin-digits text-[20px] leading-none font-extrabold tracking-[-0.035em]">
          spoti<span className="text-[#e85d00] dark:text-[#ff8a2a]">food</span>
        </span>
      ) : null}
    </span>
  );
}
