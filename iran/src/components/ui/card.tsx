import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative rounded-3xl bg-surface shadow-[var(--shadow-soft)]", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-base font-extrabold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "ink" | "accent";
}) {
  return (
    <Card
      className={cn(
        "p-5",
        tone === "ink" && "bg-[#0b0b0b] text-white shadow-none",
        tone === "accent" && "bg-accent text-accent-fg shadow-none",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-sm font-medium", tone === "default" ? "text-fg-muted" : "opacity-75")}>
          {label}
        </p>
        {icon ? (
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-2xl [&_svg]:size-5",
              tone === "default" ? "bg-surface-2 text-fg" : "bg-white/15",
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-black tracking-tight tabular-nums sm:text-3xl">{value}</p>
      {hint ? (
        <p className={cn("mt-1 text-xs", tone === "default" ? "text-fg-subtle" : "opacity-70")}>{hint}</p>
      ) : null}
    </Card>
  );
}
