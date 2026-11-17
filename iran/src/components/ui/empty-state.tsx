import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * What a page shows when it has nothing yet: an icon in a soft halo, a short title, one line of
 * explanation and, when there is one, the action that fills it. Same look everywhere (lists,
 * boards, reports), instead of a lone sentence in a dashed box.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** "sm" inside a column or a card; "md" for a page section. */
  size?: "sm" | "md";
  className?: string;
}) {
  const sm = size === "sm";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border bg-surface text-center",
        sm ? "px-4 py-7" : "px-6 py-12 sm:py-14",
        className,
      )}
    >
      {/* A faint dotted field behind the icon, in the venue's colour. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-32 [background-image:radial-gradient(var(--accent)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent)] [background-size:14px_14px] opacity-[0.07]"
      />
      <span
        aria-hidden="true"
        className={cn(
          "relative mx-auto grid place-items-center rounded-2xl bg-accent-soft text-accent-text ring-8 ring-accent-soft/40",
          sm ? "size-11 [&_svg]:size-5" : "size-14 [&_svg]:size-7",
        )}
      >
        {icon}
      </span>
      <p className={cn("relative font-bold text-balance", sm ? "mt-4 text-sm" : "mt-5 text-lg")}>{title}</p>
      {description ? (
        <p
          className={cn(
            "relative mx-auto max-w-md text-pretty text-fg-muted",
            sm ? "mt-1 text-xs leading-5" : "mt-1.5 text-sm leading-6",
          )}
        >
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
