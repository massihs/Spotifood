import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { PurchaseForm, RecipeList, StockTable, SupplierList } from "@/components/inventory/inventory-ui";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import {
  listMovements,
  listPurchases,
  listRecipes,
  listStock,
  listSuppliers,
} from "@/server/modules/inventory/service";
import { can } from "@/server/tenancy";
import { foodCosts, purchasePlan } from "@/server/modules/insights/service";
import { listTransfers, transferTargets } from "@/server/modules/inventory/transfers";
import { TransferButton } from "@/components/inventory/transfer-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeftRight, Store } from "lucide-react";
import { SupplierOrder } from "@/components/inventory/marketplace-ui";
import {
  listSuppliers as listMarketSuppliers,
  myMarketplaceOrders,
  supplierCatalogue,
} from "@/server/modules/b2b/marketplace";
import {
  FoodCostView,
  PLAN_DAYS,
  PLAN_FACTORS,
  PurchasePlanView,
} from "@/components/insights/insights-views";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/inventory">;
const TABS = [
  "stock",
  "plan",
  "costs",
  "purchases",
  "recipes",
  "suppliers",
  "market",
  "transfers",
  "movements",
] as const;
/** Tabs that need the right to manage the stock (they show costs and prices). */
const MANAGE_TABS: readonly string[] = ["plan", "costs", "market"];

export default function InventoryPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <Inventory params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Inventory({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "inventory.view", "inventory");
  const sp = await searchParams;
  const asked = (TABS as readonly string[]).includes(String(sp.tab))
    ? (sp.tab as (typeof TABS)[number])
    : "stock";
  const tab = MANAGE_TABS.includes(asked) && !can(ctx, "inventory.manage") ? "stock" : asked;
  const [t, format, items, suppliers, targets] = await Promise.all([
    getTranslations("inventory"),
    getFormatter(),
    listStock(db, ctx),
    listSuppliers(db, ctx),
    transferTargets(db, ctx),
  ]);
  const manage = can(ctx, "inventory.manage");
  const base = `/dashboard/${ctx.restaurant.id}/inventory`;
  const cur = ctx.restaurant.currency;
  const money = (c: number) => formatMoney(c, cur, "fa");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          manage ? (
            <div className="flex flex-wrap gap-2">
              {targets.length && items.length ? (
                <TransferButton rid={ctx.restaurant.id} targets={targets} items={items} />
              ) : null}
              <PurchaseForm rid={ctx.restaurant.id} items={items} suppliers={suppliers} currency={cur} />
            </div>
          ) : null
        }
      />
      <nav
        className="-mx-4 mb-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4"
        aria-label={t("title")}
      >
        {TABS.filter((k) => manage || !MANAGE_TABS.includes(k)).map((k) => (
          <Link
            key={k}
            href={k === "stock" ? base : `${base}?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap",
              tab === k ? "bg-accent text-accent-fg" : "bg-surface text-fg-muted ring-1 ring-border",
            )}
          >
            {t(`tabs.${k}`)}
          </Link>
        ))}
      </nav>

      {tab === "stock" ? (
        <StockTable rid={ctx.restaurant.id} items={items} currency={cur} canManage={manage} />
      ) : null}
      {tab === "plan"
        ? await (async () => {
            const days = PLAN_DAYS.find((d) => String(d) === sp.days) ?? 3;
            const factor = PLAN_FACTORS.find((f) => String(f) === sp.factor) ?? 1;
            return (
              <PurchasePlanView
                plan={await purchasePlan(db, ctx, { days, factor })}
                days={days}
                factor={factor}
                base={base}
                currency={cur}
              />
            );
          })()
        : null}
      {tab === "costs" ? (
        <FoodCostView
          data={await foodCosts(db, ctx)}
          currency={cur}
          menuHref={`/dashboard/${ctx.restaurant.id}/menu`}
          settingsHref={`/dashboard/${ctx.restaurant.id}/reports?tab=settings`}
        />
      ) : null}
      {tab === "suppliers" ? (
        <SupplierList rid={ctx.restaurant.id} suppliers={suppliers} canManage={manage} />
      ) : null}
      {tab === "recipes" ? (
        <RecipeList
          rid={ctx.restaurant.id}
          recipes={await listRecipes(db, ctx)}
          items={items}
          currency={cur}
          canManage={manage}
        />
      ) : null}
      {tab === "purchases" ? (
        <PurchasesList
          rows={await listPurchases(db, ctx)}
          money={money}
          date={(d) => format.dateTime(d, { dateStyle: "medium" })}
          empty={t("noPurchases")}
          t={(k, v) => t(k, v)}
        />
      ) : null}
      {tab === "market"
        ? await (async () => {
            const tm = await getTranslations("marketplace");
            const sellerId = typeof sp.supplier === "string" ? sp.supplier : null;
            if (sellerId) {
              const cat = await supplierCatalogue(db, ctx, sellerId);
              return (
                <div className="space-y-4">
                  <Link href={`${base}?tab=market`} className="text-sm font-semibold text-accent-text">
                    ‹ {tm("allSuppliers")}
                  </Link>
                  <div>
                    <p className="text-lg font-bold">{cat.seller.name}</p>
                    {cat.listing.pitch ? <p className="text-sm text-fg-muted">{cat.listing.pitch}</p> : null}
                  </div>
                  {cat.items.length ? (
                    <SupplierOrder
                      rid={ctx.restaurant.id}
                      sellerId={cat.seller.id}
                      items={cat.items}
                      currency={cat.seller.currency}
                      minOrderCents={cat.listing.minOrderCents}
                    />
                  ) : (
                    <EmptyState icon={<Store />} title={tm("noItems")} />
                  )}
                </div>
              );
            }
            const [suppliersList, mine] = await Promise.all([
              listMarketSuppliers(db, ctx),
              myMarketplaceOrders(db, ctx),
            ]);
            return (
              <div className="space-y-5">
                <p className="text-sm text-fg-muted">{tm("hint")}</p>
                {suppliersList.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {suppliersList.map((v) => (
                      <Link
                        key={v.id}
                        href={`${base}?tab=market&supplier=${v.id}`}
                        className="rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent/50"
                      >
                        <p className="font-semibold">{v.name}</p>
                        <p className="text-xs text-fg-muted">{v.city ?? ""}</p>
                        {v.pitch ? <p className="mt-2 line-clamp-2 text-sm">{v.pitch}</p> : null}
                        {v.minOrderCents ? (
                          <p className="mt-2 text-xs text-fg-muted">
                            {tm("minimum", { amount: formatMoney(v.minOrderCents, v.currency, "fa") })}
                          </p>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Store />}
                    title={tm("noSuppliers")}
                    description={tm("noSuppliersHint")}
                  />
                )}
                {mine.length ? (
                  <Card>
                    <p className="border-b border-border px-4 py-3 font-semibold">{tm("myOrders")}</p>
                    <ul className="divide-y divide-border">
                      {mine.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                          <span className="flex-1 font-medium">{o.supplier}</span>
                          <span className="text-fg-muted" dir="ltr">
                            {o.number}
                          </span>
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                            {tm(`status.${o.status}`)}
                          </span>
                          <span className="font-semibold tabular-nums">{money(o.totalCents)}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null}
              </div>
            );
          })()
        : null}
      {tab === "transfers"
        ? await (async () => {
            const rows = await listTransfers(db, ctx);
            if (!rows.length)
              return (
                <EmptyState
                  icon={<ArrowLeftRight />}
                  title={t("transfer.empty")}
                  description={t(targets.length ? "transfer.emptyHint" : "transfer.noBranch")}
                />
              );
            return (
              <Card>
                <ul className="divide-y divide-border">
                  {rows.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                      <span
                        className={cn(
                          "w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-semibold",
                          r.out ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
                        )}
                      >
                        {t(r.out ? "transfer.sent" : "transfer.received")}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{r.item}</span>
                      <span className="text-fg-muted">{r.other}</span>
                      <span dir="ltr" className="font-bold tabular-nums">
                        {r.out ? "−" : "+"}
                        {r.quantity} {t(`units.${r.unit}`)}
                      </span>
                      <span className="w-24 text-end tabular-nums">{money(r.valueCents)}</span>
                      <span className="w-28 shrink-0 text-end text-xs text-fg-subtle">
                        {format.dateTime(r.createdAt, {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: ctx.restaurant.timezone,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })()
        : null}
      {tab === "movements" ? (
        <Card>
          <ul className="divide-y divide-border">
            {(await listMovements(db, ctx)).map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className={cn(
                    "w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-semibold",
                    m.quantity >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                  )}
                >
                  {t(`kinds.${m.kind}`)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{m.itemName}</span>
                <span dir="ltr" className="font-bold tabular-nums">
                  {m.quantity > 0 ? "+" : ""}
                  {m.quantity} {t(`units.${m.unit}`)}
                </span>
                <span className="w-28 shrink-0 text-end text-xs text-fg-subtle">
                  {format.dateTime(m.createdAt, {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: ctx.restaurant.timezone,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

function PurchasesList({
  rows,
  money,
  date,
  empty,
  t,
}: {
  rows: {
    id: string;
    reference: string | null;
    totalCents: number;
    purchasedAt: Date;
    supplierName: string | null;
    lineCount: number;
  }[];
  money: (c: number) => string;
  date: (d: Date) => string;
  empty: string;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  if (!rows.length) return <p className="py-10 text-center text-fg-muted">{empty}</p>;
  return (
    <Card>
      <ul className="divide-y divide-border">
        {rows.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{p.supplierName ?? "—"}</p>
              <p className="text-xs text-fg-muted">
                {date(p.purchasedAt)} · {t("lines", { count: p.lineCount })}
                {p.reference ? ` · ${p.reference}` : ""}
              </p>
            </div>
            <p className="font-bold tabular-nums">{money(p.totalCents)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
