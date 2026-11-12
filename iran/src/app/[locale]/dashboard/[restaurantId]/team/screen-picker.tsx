"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { HOTEL_SCREENS, SCREENS, type Screen } from "@/lib/screens";

/**
 * The screens a job or a person sees, as switches: the owner ticks what each one may open
 * (the kitchen only its tickets, the till its register…). The first ticked screen is home.
 */
export function ScreenPicker({
  value,
  onChange,
  kind,
  disabled,
}: {
  value: readonly Screen[];
  onChange: (next: Screen[]) => void;
  kind: string;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const list = SCREENS.filter((s) => kind === "hotel" || !HOTEL_SCREENS.includes(s));
  const set = new Set(value);
  const toggle = (s: Screen) => {
    const next = new Set(set);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    // Never empty: a member always has a screen to land on.
    if (next.size) onChange(SCREENS.filter((x) => next.has(x)));
  };
  const all = list.every((s) => set.has(s));
  return (
    <div className={cn("space-y-2", disabled && "pointer-events-none opacity-50")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">{t("team.screens.hint")}</p>
        <button
          type="button"
          onClick={() => onChange(all ? [list[0]!] : [...list])}
          className="shrink-0 text-xs font-semibold text-accent-text hover:underline"
        >
          {all ? t("team.screens.none") : t("team.screens.all")}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {list.map((s) => {
          const on = set.has(s);
          return (
            <button
              key={s}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(s)}
              className={cn(
                "flex h-10 items-center gap-2 rounded-xl px-2.5 text-start text-sm ring-1 transition-colors",
                on
                  ? "bg-accent-soft font-semibold ring-accent"
                  : "text-fg-muted ring-border hover:bg-surface-2",
              )}
            >
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded",
                  on ? "bg-accent text-accent-fg" : "ring-1 ring-border-strong",
                )}
                aria-hidden="true"
              >
                {on ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="truncate">{t(`nav.${s}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
