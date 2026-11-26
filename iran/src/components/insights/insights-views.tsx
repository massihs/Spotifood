import {
  AlertTriangle,
  ChefHat,
  Coins,
  Puzzle,
  ShoppingBasket,
  Sparkles,
  Star,
  Tractor,
  Trash2,
} from "@/components/icons";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PrintButton } from "@/components/ui/print-button";
import { Kpi } from "@/components/reports/report-parts";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import type { EngineeredItem, MenuClass, StaffReview } from "@/server/modules/insights/analysis";
import type { foodCosts, purchasePlan } from "@/server/modules/insights/service";

/** The "save money" screens: purchase list, food cost, menu engineering, staff anomalies. */

const numberFormat =
  (locale: string) =>
  (v: number, digits = 0) =>
    v.toLocaleString(locale === "fa" ? "fa-IR" : locale, { maximumFractionDigits: digits });

function Chips({ items }: { items: { href: string; label: string; on: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn(
            "kashi-btn px-3 py-1.5 text-sm font-medium",
            i.on ? "bg-fg text-bg" : "bg-surface text-fg-muted ring-1 ring-border",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

// ─── Purchase list ───────────────────────────────────────────────────────────

export const PLAN_DAYS = [2, 3, 7, 14] as const;
export const PLAN_FACTORS = [1, 1.2, 1.5, 2] as const;

export async function PurchasePlanView({
  plan,
  days,
  factor,
  base,
  currency,
}: {
  plan: Awaited<ReturnType<typeof purchasePlan>>;
  days: number;
  factor: number;
  base: string;
  currency: string;
}) {
  const [t, tu, locale] = await Promise.all([
    getTranslations("insights.plan"),
    getTranslations("inventory.units"),
    getLocale(),
  ]);
  const n = numberFormat(locale);
  const money = (c: number) => formatMoney(c, currency, locale);
  const href = (d: number, f: number) => `${base}?tab=plan&days=${d}&factor=${f}`;
  const buy = plan.rows.filter((r) => r.toBuy > 0);
  if (!plan.rows.length)
    return <EmptyState icon={<ShoppingBasket />} title={t("noItems")} description={t("noItemsHint")} />;
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4 print:hidden">
        <p className="text-sm text-fg-muted">{t("hint")}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-fg-muted">{t("days")}</p>
            <Chips
              items={PLAN_DAYS.map((d) => ({
                href: href(d, factor),
                label: t("daysN", { n: d }),
                on: d === days,
              }))}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-fg-muted">{t("factor")}</p>
            <Chips
              items={PLAN_FACTORS.map((f) => ({
                href: href(days, f),
                label: f === 1 ? t("normal") : `×${n(f, 1)}`,
                on: f === factor,
              }))}
            />
          </div>
          <div className="ms-auto">
            <PrintButton label={t("print")} />
          </div>
        </div>
        {!plan.hasHistory ? (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">{t("noHistory")}</p>
        ) : null}
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label={t("toBuyCount")} value={n(buy.length)} hint={t("ofItems", { n: n(plan.rows.length) })} />
        <Kpi label={t("budget")} value={money(plan.totalCents)} hint={t("budgetHint")} />
        <Kpi
          label={t("runningOut")}
          value={n(plan.rows.filter((r) => r.daysLeft != null && r.daysLeft < days).length)}
          hint={t("runningOutHint", { n: days })}
        />
      </div>
      <Card className="overflow-x-auto">
        <p className="hidden px-4 pt-4 text-lg font-bold print:block">{t("printTitle", { n: days })}</p>
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-surface-2 text-xs text-fg-muted">
            <tr>
              <th className="px-4 py-2 text-start font-medium">{t("item")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("inStock")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("perDay")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("daysLeft")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("toBuy")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("cost")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {plan.rows.map((r) => (
              <tr key={r.id} className={cn(r.toBuy <= 0 && "text-fg-muted print:hidden")}>
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2 text-end tabular-nums">
                  {n(r.quantity, 1)} {tu(r.unit)}
                </td>
                <td className="px-4 py-2 text-end tabular-nums">{n(r.avgDaily, 2)}</td>
                <td className="px-4 py-2 text-end tabular-nums">
                  {r.daysLeft == null ? (
                    "—"
                  ) : (
                    <span
                      className={cn(
                        "kashi-btn px-2 py-0.5 text-xs font-semibold [--cut:5px]",
                        r.daysLeft < 2
                          ? "bg-danger-soft text-danger"
                          : r.daysLeft < days
                            ? "bg-warning-soft text-warning"
                            : "bg-success-soft text-success",
                      )}
                    >
                      {t("daysN", { n: n(r.daysLeft, r.daysLeft < 10 ? 1 : 0) })}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-end font-bold tabular-nums">
                  {r.toBuy > 0 ? `${n(r.toBuy, 1)} ${tu(r.unit)}` : "—"}
                </td>
                <td className="px-4 py-2 text-end tabular-nums">{r.costCents ? money(r.costCents) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── Food cost ───────────────────────────────────────────────────────────────

export async function FoodCostView({
  data,
  currency,
  menuHref,
  settingsHref,
}: {
  data: Awaited<ReturnType<typeof foodCosts>>;
  currency: string;
  menuHref: string;
  settingsHref: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("insights.cost"), getLocale()]);
  const n = numberFormat(locale);
  const money = (c: number) => formatMoney(c, currency, locale);
  const over = data.rows.filter((r) => r.over);
  if (!data.rows.length)
    return <EmptyState icon={<Coins />} title={t("empty")} description={t("emptyHint")} />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label={t("target")} value={`${n(data.target)}٪`} hint={t("targetHint")} />
        <Kpi
          label={t("overCount")}
          value={n(over.length)}
          tone={over.length ? "bad" : "good"}
          hint={t("ofDishes", { n: n(data.rows.length) })}
        />
        <Kpi
          label={t("average")}
          value={`${n(data.rows.reduce((s, r) => s + r.foodCostPct, 0) / data.rows.length, 1)}٪`}
        />
      </div>
      <Card className="overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="text-sm text-fg-muted">{t("hint")}</p>
          <div className="flex gap-2">
            <Link href={settingsHref} className="kashi-btn kashi-frame px-3 py-1.5 text-sm font-semibold">
              {t("changeTarget")}
            </Link>
            <Link
              href={menuHref}
              className="kashi-btn bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg"
            >
              {t("editPrices")}
            </Link>
          </div>
        </div>
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-surface-2 text-xs text-fg-muted">
            <tr>
              <th className="px-4 py-2 text-start font-medium">{t("dish")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("price")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("cost")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("share")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("suggested")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((r) => (
              <tr key={r.productId}>
                <td className="px-4 py-2 font-medium">
                  {r.over ? (
                    <AlertTriangle className="me-1.5 inline size-4 text-danger" aria-hidden="true" />
                  ) : null}
                  {r.name}
                </td>
                <td className="px-4 py-2 text-end tabular-nums">{money(r.priceCents)}</td>
                <td className="px-4 py-2 text-end text-fg-muted tabular-nums">{money(r.costCents)}</td>
                <td className="px-4 py-2 text-end">
                  <span
                    className={cn(
                      "kashi-btn px-2 py-0.5 text-xs font-semibold tabular-nums [--cut:5px]",
                      r.over
                        ? "bg-danger-soft text-danger"
                        : r.foodCostPct > data.target - 5
                          ? "bg-warning-soft text-warning"
                          : "bg-success-soft text-success",
                    )}
                  >
                    {n(r.foodCostPct, 1)}٪
                  </span>
                </td>
                <td className="px-4 py-2 text-end font-bold tabular-nums">
                  {r.suggestedPriceCents ? money(r.suggestedPriceCents) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── Menu engineering ────────────────────────────────────────────────────────

const CLASS_ICON = { star: Star, plowhorse: Tractor, puzzle: Puzzle, dog: Trash2 } as const;
const CLASS_TONE: Record<MenuClass, string> = {
  star: "bg-success-soft text-success",
  plowhorse: "bg-warning-soft text-warning",
  puzzle: "bg-info-soft text-info",
  dog: "bg-danger-soft text-danger",
};

export async function MenuEngineeringView({
  result,
  currency,
}: {
  result: {
    rows: EngineeredItem[];
    avgMarginCents: number;
    popularThresholdPct: number;
    uncosted: number;
  };
  currency: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("insights.menu"), getLocale()]);
  const n = numberFormat(locale);
  const money = (c: number) => formatMoney(c, currency, locale);
  if (!result.rows.length)
    return <EmptyState icon={<ChefHat />} title={t("empty")} description={t("emptyHint")} />;
  const classes: MenuClass[] = ["star", "plowhorse", "puzzle", "dog"];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {classes.map((c) => {
          const Icon = CLASS_ICON[c];
          const items = result.rows.filter((r) => r.class === c);
          return (
            <Card key={c} className="p-4">
              <div className="flex items-center gap-2">
                <span className={cn("grid size-9 place-items-center rounded-xl", CLASS_TONE[c])}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-bold">{t(`classes.${c}`)}</p>
                  <p className="text-xs text-fg-muted">{t("dishesN", { n: n(items.length) })}</p>
                </div>
              </div>
              <p className="mt-2 text-xs leading-5 text-fg-muted">{t(`advice.${c}`)}</p>
              {items.length ? (
                <p className="mt-2 line-clamp-2 text-sm font-medium">{items.map((i) => i.name).join("، ")}</p>
              ) : null}
            </Card>
          );
        })}
      </div>
      <Card className="overflow-x-auto">
        <p className="border-b border-border px-4 py-3 text-sm text-fg-muted">
          {t("hint", { margin: money(result.avgMarginCents), mix: n(result.popularThresholdPct, 1) })}
          {result.uncosted ? ` ${t("uncosted", { n: n(result.uncosted) })}` : ""}
        </p>
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-surface-2 text-xs text-fg-muted">
            <tr>
              <th className="px-4 py-2 text-start font-medium">{t("dish")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("sold")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("mix")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("unitMargin")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("foodCost")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("class")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.rows.map((r) => {
              const Icon = r.class ? CLASS_ICON[r.class] : null;
              return (
                <tr key={`${r.productId}-${r.name}`}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{r.name}</span>
                    {r.category ? <span className="ms-2 text-xs text-fg-muted">{r.category}</span> : null}
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">{n(r.quantity)}</td>
                  <td className="px-4 py-2 text-end tabular-nums">{n(r.mixPct, 1)}٪</td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    {r.unitMarginCents != null ? money(r.unitMarginCents) : "—"}
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    {r.foodCostPct != null ? `${n(r.foodCostPct, 1)}٪` : "—"}
                  </td>
                  <td className="px-4 py-2 text-end">
                    {r.class && Icon ? (
                      <span
                        className={cn(
                          "kashi-btn inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold [--cut:5px]",
                          CLASS_TONE[r.class],
                        )}
                      >
                        <Icon className="size-3" aria-hidden="true" />
                        {t(`classes.${r.class}`)}
                      </span>
                    ) : (
                      <span className="text-xs text-fg-subtle">{t("noRecipe")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── Staff anomalies ─────────────────────────────────────────────────────────

export async function AnomaliesView({
  rows,
  currency,
  securityHref,
}: {
  rows: StaffReview[];
  currency: string;
  securityHref: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("insights.anomalies"), getLocale()]);
  const n = numberFormat(locale);
  const money = (c: number) =>
    c < 0 ? `−${formatMoney(-c, currency, locale)}` : formatMoney(c, currency, locale);
  if (!rows.length) return <EmptyState icon={<Sparkles />} title={t("empty")} description={t("emptyHint")} />;
  const flagged = rows.filter((r) => r.signals.length);
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm text-fg-muted">{t("hint")}</p>
        <p className={cn("mt-2 font-semibold", flagged.length ? "text-danger" : "text-success")}>
          {flagged.length ? t("flagged", { n: n(flagged.length) }) : t("allClear")}
        </p>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-xs text-fg-muted">
            <tr>
              <th className="px-4 py-2 text-start font-medium">{t("person")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("sales")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("cancellations")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("discounts")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("refunds")}</th>
              <th className="px-4 py-2 text-end font-medium">{t("cash")}</th>
              <th className="px-4 py-2 text-start font-medium">{t("signals")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const hot = (s: string) => r.signals.includes(s as never) && "font-bold text-danger";
              return (
                <tr key={r.userId} className={cn(r.signals.length > 0 && "bg-danger-soft/30")}>
                  <td className="px-4 py-2">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-fg-muted">{t("ordersN", { n: n(r.orders) })}</p>
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">{money(r.salesCents)}</td>
                  <td className={cn("px-4 py-2 text-end tabular-nums", hot("cancellations"))}>
                    {n(r.cancellations)}
                    {r.cancelledCents ? (
                      <span className="block text-xs">{money(r.cancelledCents)}</span>
                    ) : null}
                  </td>
                  <td className={cn("px-4 py-2 text-end tabular-nums", hot("discounts"))}>
                    {r.discountCents ? money(r.discountCents) : "—"}
                  </td>
                  <td className={cn("px-4 py-2 text-end tabular-nums", hot("refunds"))}>
                    {r.refundCents ? money(r.refundCents) : "—"}
                  </td>
                  <td className={cn("px-4 py-2 text-end tabular-nums", hot("cash"))}>
                    {r.cashDifferenceCents ? money(r.cashDifferenceCents) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.signals.map((s) => (
                        <span
                          key={s}
                          className="kashi-btn bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger [--cut:5px]"
                        >
                          {t(`signal.${s}`)}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-border px-4 py-2.5 text-xs text-fg-muted">
          {t("footer")}{" "}
          <Link href={securityHref} className="font-semibold text-accent-text underline">
            {t("seeEvents")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
