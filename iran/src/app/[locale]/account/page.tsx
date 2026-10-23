import { ChevronLeft, ChevronRight, Info, Salad, Settings, Sparkles, UtensilsCrossed } from "lucide-react";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { CalorieRing, DailyChart, NutrientBar } from "@/components/account/nutrition-ui";
import { DinerLogin } from "@/components/account/diner-login";
import { LogoutButton } from "@/components/account/settings-forms";
import { Card, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { edition } from "@/config/edition";
import { cn } from "@/lib/cn";
import { NUTRIENTS, REFERENCE_INTAKE } from "@/lib/nutrition";
import { getCurrentDiner } from "@/server/auth/diner";
import { db } from "@/server/db/client";
import {
  dayJournal,
  isDate,
  localDate,
  rangeTotals,
  shiftDate,
  topDishes,
} from "@/server/modules/diners/journal";

type Props = PageProps<"/[locale]/account">;

export default async function AccountPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface" />}>
      <Account searchParams={searchParams} />
    </Suspense>
  );
}

async function Account({ searchParams }: Pick<Props, "searchParams">) {
  const diner = await getCurrentDiner();
  const t = await getTranslations("account");
  if (!diner)
    return (
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-text">
            <Salad className="size-7" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{t("loginTitle")}</h1>
          <p className="mt-1.5 text-fg-muted">{t("loginSubtitle")}</p>
        </div>
        <Card className="p-6">
          <DinerLogin sms={edition.edition === "iran" || edition.defaultLocale === "fa"} />
        </Card>
        <p className="mt-4 text-center text-xs text-fg-muted">{t("privacyNote")}</p>
      </div>
    );

  const sp = await searchParams;
  const tz = diner.timezone;
  const today = localDate(new Date(), tz);
  const date = isDate(sp.d) && sp.d <= today ? sp.d : today;
  const period = sp.p === "30" ? 30 : 7;
  const [format, tn, day, range, favourites] = await Promise.all([
    getFormatter(),
    getTranslations("nutrition"),
    dayJournal(db, diner, date),
    rangeTotals(db, diner, shiftDate(date, -(period - 1)), date),
    topDishes(db, diner.id, 5),
  ]);
  const goals = { ...REFERENCE_INTAKE, ...(diner.goals ?? {}) };
  const dateOf = (d: string) => new Date(`${d}T12:00:00Z`);
  const fmtDay = (d: string, style: "long" | "short") =>
    format.dateTime(
      dateOf(d),
      style === "long"
        ? { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }
        : { day: "numeric", timeZone: "UTC" },
    );
  const n = (v: number, digits = 0) => format.number(v, { maximumFractionDigits: digits });
  const href = (d: string, p = period) => `/account?d=${d}${p === 30 ? "&p=30" : ""}`;
  const withMeals = range.filter((d) => d.meals > 0);
  const avg = (k: (typeof NUTRIENTS)[number]) =>
    withMeals.length ? withMeals.reduce((s, d) => s + d[k], 0) / withMeals.length : 0;
  const total = day.total;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("hello", { name: diner.name ?? "" })}</h1>
          <p className="text-sm text-fg-muted">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/account/settings"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-fg-muted ring-1 ring-border hover:text-fg"
          >
            <Settings className="size-4" aria-hidden="true" />
            {t("settings")}
          </Link>
          <LogoutButton />
        </div>
      </div>

      {/* Day picker */}
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface p-2 shadow-[var(--shadow-soft)]">
        <Link
          href={href(shiftDate(date, -1))}
          aria-label={t("prevDay")}
          className="grid size-10 place-items-center rounded-xl hover:bg-surface-2"
        >
          <ChevronRight className="size-5 ltr:rotate-180" aria-hidden="true" />
        </Link>
        <div className="text-center">
          <p className="font-bold">{date === today ? t("today") : fmtDay(date, "long")}</p>
          {date === today ? <p className="text-xs text-fg-muted">{fmtDay(date, "long")}</p> : null}
        </div>
        {date < today ? (
          <Link
            href={href(shiftDate(date, 1))}
            aria-label={t("nextDay")}
            className="grid size-10 place-items-center rounded-xl hover:bg-surface-2"
          >
            <ChevronLeft className="size-5 ltr:rotate-180" aria-hidden="true" />
          </Link>
        ) : (
          <span className="size-10" />
        )}
      </div>

      {/* Summary of the day */}
      <Card className="p-5">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="text-center">
            <CalorieRing
              value={total.kcal}
              goal={goals.kcal}
              label={n(total.kcal)}
              sub={t("ofKcal", { goal: n(goals.kcal) })}
            />
            <p className="mt-2 text-sm font-medium text-fg-muted">
              {total.kcal <= goals.kcal
                ? t("kcalLeft", { n: n(goals.kcal - total.kcal) })
                : t("kcalOver", { n: n(total.kcal - goals.kcal) })}
            </p>
          </div>
          <div className="w-full flex-1 space-y-3.5">
            {(["proteinG", "carbsG", "sugarG", "fatG", "fiberG", "saltG"] as const).map((k) => (
              <NutrientBar
                key={k}
                nutrient={k}
                name={tn(`short.${k}`)}
                value={total[k]}
                goal={goals[k]}
                valueLabel={tn("grams", { n: n(total[k], 1) })}
                goalLabel={tn("grams", { n: n(goals[k], 1) })}
              />
            ))}
          </div>
        </div>
        {day.unknownPortions || day.missing.length ? (
          <p className="mt-5 flex gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-fg-muted">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {day.unknownPortions ? t("unknownDishes", { n: day.unknownPortions }) : t("partialData")}
          </p>
        ) : null}
      </Card>

      {/* Meals */}
      <Card>
        <CardHeader title={t("meals")} />
        {day.meals.length ? (
          <ul className="divide-y divide-border">
            {day.meals.map((m) => (
              <li key={m.orderId} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex items-baseline gap-2 font-semibold">
                    <bdi>{m.restaurant}</bdi>
                    <span className="text-xs font-normal text-fg-muted">
                      {format.dateTime(m.at, { hour: "2-digit", minute: "2-digit", timeZone: tz })}
                    </span>
                  </p>
                  <span className="text-sm font-bold tabular-nums">{tn("kcal", { n: n(m.total.kcal) })}</span>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {m.items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span className="text-fg-muted">
                        {i.quantity > 1 ? `${n(i.quantity)} × ` : ""}
                        {i.name}
                      </span>
                      <span className={cn("tabular-nums", !i.nutrition && "text-xs text-fg-muted")}>
                        {i.nutrition?.kcal != null
                          ? tn("kcal", { n: n(i.nutrition.kcal * i.quantity) })
                          : t("noData")}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-fg-muted">
                  {tn("short.proteinG")} {tn("grams", { n: n(m.total.proteinG, 1) })} · {tn("short.carbsG")}{" "}
                  {tn("grams", { n: n(m.total.carbsG, 1) })} · {tn("short.fatG")}{" "}
                  {tn("grams", { n: n(m.total.fatG, 1) })}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-10 text-center">
            <UtensilsCrossed className="mx-auto size-8 text-fg-muted" aria-hidden="true" />
            <p className="mt-3 font-semibold">{t("noMeals")}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">{t("noMealsHint")}</p>
          </div>
        )}
      </Card>

      {/* Period */}
      <Card>
        <CardHeader
          title={t("trend")}
          action={
            <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-sm font-semibold">
              {([7, 30] as const).map((p) => (
                <Link
                  key={p}
                  href={href(date, p)}
                  className={cn(
                    "rounded-full px-3 py-1",
                    period === p ? "bg-surface shadow-[var(--shadow-soft)]" : "text-fg-muted",
                  )}
                >
                  {t("days", { n: p })}
                </Link>
              ))}
            </div>
          }
        />
        <div className="space-y-5 p-5">
          <DailyChart
            goal={goals.kcal}
            goalLabel={t("goal", { n: n(goals.kcal) })}
            caption={t("chartCaption")}
            days={range.map((d) => ({
              date: d.date,
              label: fmtDay(d.date, "long"),
              short: fmtDay(d.date, "short"),
              kcal: Math.round(d.kcal),
              tooltip: `${fmtDay(d.date, "long")} · ${tn("kcal", { n: n(d.kcal) })}`,
              href: href(d.date),
              active: d.date === date,
            }))}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["kcal", "proteinG", "fiberG", "sugarG"] as const).map((k) => (
              <div key={k} className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs text-fg-muted">{t("avgOf", { what: tn(`short.${k}`) })}</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">
                  {k === "kcal" ? tn("kcal", { n: n(avg(k)) }) : tn("grams", { n: n(avg(k), 1) })}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-fg-muted">{t("avgHint", { n: withMeals.length })}</p>
        </div>
      </Card>

      {favourites.length ? (
        <Card>
          <CardHeader title={t("favourites")} />
          <ul className="divide-y divide-border">
            {favourites.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Sparkles className="size-4 text-accent-text" aria-hidden="true" />
                  {f.name}
                </span>
                <span className="text-fg-muted tabular-nums">
                  {t("times", { n: f.count })}
                  {f.kcal != null ? ` · ${tn("kcal", { n: n(f.kcal) })}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-center text-xs text-fg-muted">{t("disclaimer")}</p>
    </div>
  );
}
