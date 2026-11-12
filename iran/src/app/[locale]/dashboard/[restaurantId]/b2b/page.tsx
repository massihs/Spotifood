import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Briefcase, FileText, ShoppingBasket, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card, StatCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { listTradeCustomers, listTradeOrders, tradeCatalogue } from "@/server/modules/b2b/service";
import { jalaliDateTime } from "@/lib/jalali";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { TradeCustomers, TradeOrderDesk } from "./b2b-desk";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/b2b">;
const monthAgo = () => new Date(Date.now() - 30 * 86_400_000);
const TABS = ["order", "customers", "orders"] as const;
type Tab = (typeof TABS)[number];

export default function B2bPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <B2b params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Trade sales (B2B): the café sells its products to other venues at trade prices. The order
 * desk, the professional customers with what they owe, and the latest trade orders.
 */
async function B2b({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "orders.create", "b2b");
  const tab: Tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : "order";
  const [t, locale, customers, recent, menu] = await Promise.all([
    getTranslations("b2b"),
    getLocale(),
    can(ctx, "customers.view") ? listTradeCustomers(db, ctx) : Promise.resolve([]),
    can(ctx, "orders.view") ? listTradeOrders(db, ctx) : Promise.resolve([]),
    tradeCatalogue(db, ctx),
  ]);
  const cur = ctx.restaurant.currency;
  const money = (c: number) => formatMoney(c, cur, locale);
  const owed = customers.reduce((s, c) => s + c.balanceCents, 0);
  const overdue = customers.filter((c) => c.overdue).length;
  const month = recent.filter((o) => o.placedAt >= monthAgo() && o.status !== "cancelled");
  const products = menu.categories.flatMap((c) =>
    c.productIds.map((id) => {
      const p = menu.products[id]!;
      return {
        id: p.id,
        name: p.name,
        categoryName: p.categoryName,
        priceCents: p.priceCents,
        tradePriceCents: p.tradePriceCents,
        isAvailable: p.isAvailable,
        image: p.images[0]?.sm ?? null,
      };
    }),
  );
  const base = `/dashboard/${ctx.restaurant.id}/b2b`;
  const icons = { order: ShoppingBasket, customers: UsersRound, orders: FileText };

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("stats.customers")} value={customers.length} icon={<Briefcase />} tone="indigo" />
        <StatCard label={t("stats.owed")} value={money(owed)} icon={<UsersRound />} tone="amber" />
        <StatCard
          label={t("stats.overdue")}
          value={overdue}
          icon={<FileText />}
          tone={overdue ? "rose" : "emerald"}
        />
        <StatCard
          label={t("stats.month")}
          value={money(month.reduce((s, o) => s + o.totalCents, 0))}
          hint={t("stats.orders", { n: month.length })}
          icon={<ShoppingBasket />}
          tone="ink"
        />
      </div>
      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1" aria-label={t("title")}>
        {TABS.map((k) => {
          const Icon = icons[k];
          return (
            <Link
              key={k}
              href={`${base}?tab=${k}`}
              aria-current={tab === k ? "page" : undefined}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold",
                tab === k ? "bg-surface shadow-[var(--shadow-soft)]" : "text-fg-muted hover:text-fg",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(`tabs.${k}`)}
            </Link>
          );
        })}
      </nav>

      {tab === "order" ? (
        <TradeOrderDesk
          restaurantId={ctx.restaurant.id}
          currency={cur}
          customers={customers}
          products={products}
        />
      ) : tab === "customers" ? (
        <TradeCustomers
          restaurantId={ctx.restaurant.id}
          currency={cur}
          customers={customers}
          canManage={can(ctx, "customers.manage")}
          canCollect={can(ctx, "payments.record")}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-border text-xs text-fg-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t("col.number")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("col.date")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("customer")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("col.payment")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("total")}</th>
                <th className="px-4 py-3">
                  <span className="sr-only">{t("col.invoice")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recent.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-semibold" dir="ltr">
                    <span className="block text-start">{o.number}</span>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {jalaliDateTime(o.placedAt, ctx.restaurant.timezone)}
                  </td>
                  <td className="px-4 py-3">{o.customerName ?? o.customerPhone}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      // A sale on account is settled for the order, not yet for the customer.
                      const k =
                        o.paymentStatus !== "paid"
                          ? "unpaid"
                          : o.invoice?.provider === "account"
                            ? "account"
                            : "paid";
                      return (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            k === "paid"
                              ? "bg-success-soft text-success"
                              : k === "account"
                                ? "bg-accent-soft text-accent-text"
                                : "bg-warning-soft text-fg",
                          )}
                        >
                          {t(`paymentStatus.${k}`)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-end font-semibold tabular-nums">{money(o.totalCents)}</td>
                  <td className="px-4 py-3 text-end">
                    {o.invoice ? (
                      <Link
                        href={`/invoice/${o.invoice.token}`}
                        className="text-sm font-semibold text-accent-text"
                      >
                        {t("col.invoice")}
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!recent.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-fg-muted">
                    {t("noOrders")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
