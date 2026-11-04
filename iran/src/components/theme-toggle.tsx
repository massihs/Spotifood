"use client";

import { Moon, Sun, SunMoon } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePref, writePref } from "@/components/ui/use-pref";
import { cn } from "@/lib/cn";
import { applyTheme, isThemeChoice, nextTheme, THEME_KEY, type ThemeChoice } from "@/lib/theme";

const ICONS = { auto: SunMoon, light: Sun, dark: Moon } as const;

/** One button cycling Auto → Day → Night; the choice is kept on this device. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const raw = usePref(THEME_KEY, "auto");
  const current: ThemeChoice = isThemeChoice(raw) ? raw : "auto";
  const Icon = ICONS[current];
  const next = nextTheme(current);
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        writePref(THEME_KEY, next);
      }}
      title={`${t(current)} · ${t("switchTo", { mode: t(next) })}`}
      aria-label={t("switchTo", { mode: t(next) })}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-fg-muted ring-1 ring-border transition-colors hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
