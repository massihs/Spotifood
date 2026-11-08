import { cn } from "@/lib/cn";

/**
 * Sales per hour: today in the brand colour, the same weekday last week as a grey shadow behind
 * (what usually comes next). Server-rendered bars, a native tooltip per hour.
 */
export function HourlyChart({
  today,
  lastWeek,
  currentHour,
  locale,
  money,
  todayLabel,
  lastWeekLabel,
  summary,
  emptyLabel,
}: {
  /** Shown instead of empty bars before the first sale (and nothing last week either). */
  emptyLabel: string;
  today: number[];
  lastWeek: number[];
  currentHour: number;
  locale: string;
  money: (cents: number) => string;
  todayLabel: string;
  lastWeekLabel: string;
  summary: string;
}) {
  // The hours that matter: those with sales on either day, the current hour, 8 hours at least.
  const active = [...today.keys()].filter((h) => (today[h] ?? 0) > 0 || (lastWeek[h] ?? 0) > 0);
  let from = Math.min(currentHour, ...(active.length ? active : [10]));
  let to = Math.max(currentHour, ...(active.length ? active : [22]));
  while (to - from < 9) {
    if (from > 0) from -= 1;
    if (to - from < 9 && to < 23) to += 1;
    if (from === 0 && to === 23) break;
  }
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const max = Math.max(1, ...hours.map((h) => Math.max(today[h] ?? 0, lastWeek[h] ?? 0)));
  const hourLabel = (h: number) => new Intl.NumberFormat(locale).format(h);
  const step = hours.length > 14 ? 3 : 2;
  const empty = !active.length;

  return (
    <figure>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-accent" aria-hidden="true" />
          {todayLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-fg/12" aria-hidden="true" />
          {lastWeekLabel}
        </span>
      </figcaption>
      {empty ? (
        <p className="mt-3 grid h-32 place-items-center rounded-2xl border border-dashed border-border-strong px-6 text-center text-sm text-fg-muted sm:h-40">
          {emptyLabel}
        </p>
      ) : null}
      <div
        className={cn("mt-3 flex h-32 items-end gap-1 sm:h-40 sm:gap-1.5", empty && "hidden")}
        role="img"
        aria-label={summary}
      >
        {hours.map((h, i) => {
          const now = h === currentHour;
          const past = h <= currentHour;
          return (
            <div
              key={h}
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
              title={`${hourLabel(h)}:00 · ${todayLabel}: ${money(today[h] ?? 0)} · ${lastWeekLabel}: ${money(lastWeek[h] ?? 0)}`}
            >
              <div className="relative flex h-full w-full items-end justify-center">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t-md bg-fg/8 transition-colors group-hover:bg-fg/14"
                  style={{ height: `${((lastWeek[h] ?? 0) / max) * 100}%` }}
                />
                {past ? (
                  <div
                    className={cn(
                      "relative w-[62%] origin-bottom animate-[bar-grow_0.6s_cubic-bezier(0.2,0.7,0.2,1)_both] rounded-t-md",
                      now
                        ? "bg-accent shadow-[0_0_0_3px_var(--accent-soft)]"
                        : "bg-accent/85 group-hover:bg-accent",
                    )}
                    style={{
                      height: `${Math.max((today[h] ?? 0) > 0 ? 3 : 0, ((today[h] ?? 0) / max) * 100)}%`,
                      animationDelay: `${i * 25}ms`,
                    }}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className={cn("mt-1.5 flex gap-1 sm:gap-1.5", empty && "hidden")} aria-hidden="true">
        {hours.map((h, i) => (
          <span
            key={h}
            className={cn(
              "flex-1 text-center text-[10px] tabular-nums",
              h === currentHour ? "font-bold text-fg" : "text-fg-subtle",
              i % step !== 0 && h !== currentHour && "invisible",
            )}
          >
            {hourLabel(h)}
          </span>
        ))}
      </div>
    </figure>
  );
}
