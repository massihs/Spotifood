import { cn } from "@/lib/cn";
import { MORE_IS_BETTER, type Nutrient } from "@/lib/nutrition";

/** Calories of the day against the goal: a ring with the number in the middle. */
export function CalorieRing({
  value,
  goal,
  label,
  sub,
}: {
  value: number;
  goal: number;
  label: string;
  sub: string;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const ratio = goal > 0 ? value / goal : 0;
  const shown = Math.min(1, ratio);
  return (
    <div className="relative size-40 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-surface-2" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${c * shown} ${c}`}
          className={ratio > 1.1 ? "stroke-warning" : "stroke-accent"}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-3xl font-bold tabular-nums">{label}</span>
        <span className="text-xs text-fg-muted">{sub}</span>
      </div>
    </div>
  );
}

/** One nutrient: amount, goal and a bar (amber when a "less is better" nutrient goes over). */
export function NutrientBar({
  nutrient,
  name,
  value,
  goal,
  valueLabel,
  goalLabel,
}: {
  nutrient: Nutrient;
  name: string;
  value: number;
  goal: number;
  valueLabel: string;
  goalLabel: string;
}) {
  const ratio = goal > 0 ? value / goal : 0;
  const over = !MORE_IS_BETTER[nutrient] && ratio > 1;
  const reached = MORE_IS_BETTER[nutrient] && ratio >= 1;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{name}</span>
        <span className="text-fg-muted tabular-nums">
          <span className="font-semibold text-fg">{valueLabel}</span> / {goalLabel}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={value}
      >
        <div
          className={cn("h-full rounded-full", over ? "bg-warning" : reached ? "bg-success" : "bg-accent")}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Calories per day (one series, one hue) with the daily goal as a dashed reference line.
 * Each bar has a native tooltip and the same numbers are in the table below for screen readers.
 */
export function DailyChart({
  days,
  goal,
  goalLabel,
  caption,
}: {
  days: {
    date: string;
    label: string;
    short: string;
    kcal: number;
    tooltip: string;
    href: string;
    active: boolean;
  }[];
  goal: number;
  goalLabel: string;
  caption: string;
}) {
  const H = 140;
  const max = Math.max(goal * 1.2, ...days.map((d) => d.kcal), 1);
  const y = (v: number) => H - (v / max) * H;
  const every = days.length > 14 ? 5 : 1;
  return (
    <figure>
      <div className="relative" style={{ height: H + 24 }}>
        <svg
          viewBox={`0 0 ${days.length * 10} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-x-0 top-0 w-full"
          style={{ height: H }}
          aria-hidden="true"
        >
          <line
            x1="0"
            x2={days.length * 10}
            y1={H - 0.5}
            y2={H - 0.5}
            className="stroke-border"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Bars as links: tap a day to open it. */}
        <div className="absolute inset-x-0 top-0 flex items-end gap-[2px]" style={{ height: H }}>
          {days.map((d) => (
            <a
              key={d.date}
              href={d.href}
              title={d.tooltip}
              aria-label={d.tooltip}
              className="group flex h-full flex-1 items-end justify-center"
            >
              <span
                className={cn(
                  "block w-full max-w-12 rounded-t-[4px] transition-opacity group-hover:opacity-80",
                  d.active ? "bg-accent" : "bg-accent/45",
                )}
                style={{ height: d.kcal > 0 ? Math.max(3, H - y(d.kcal)) : 0 }}
              />
            </a>
          ))}
        </div>
        {goal > 0 ? (
          <div
            className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-fg-muted/50"
            style={{ top: y(goal) }}
          >
            <span className="absolute end-0 -top-5 rounded bg-surface px-1 text-[11px] text-fg-muted">
              {goalLabel}
            </span>
          </div>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex gap-[2px] text-center text-[10px] text-fg-muted">
          {days.map((d, i) => (
            <span key={d.date} className={cn("flex-1 truncate", d.active && "font-bold text-fg")}>
              {i % every === 0 || d.active ? d.short : ""}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th>{d.label}</th>
              <td>{d.kcal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
