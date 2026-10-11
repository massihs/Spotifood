import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { OrderCard } from "@/components/dashboard/order-card";
import { CloseTableButton } from "@/components/dashboard/close-table-button";
import { LiveRefresh } from "@/components/realtime/live";
import { Card, StatCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { can } from "@/server/tenancy";
import { getTableOverview } from "@/server/modules/orders/service";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/tables/[tableId]">["params"];

export default function TableDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <TableDetail params={params} />
    </Suspense>
  );
}

async function TableDetail({ params }: { params: Params }) {
  const { restaurantId, tableId } = await params;
  const ctx = await requireRestaurant(restaurantId, "tables.view");
  let view: Awaited<ReturnType<typeof getTableOverview>>;
  try {
    view = await getTableOverview(db, ctx, tableId);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const money = (c: number) =>
    format.number(c / 100, { style: "currency", currency: ctx.restaurant.currency });
  const orderCount = view.participants.reduce((n, p) => n + p.orders.length, 0);

  return (
    <>
      <LiveRefresh types={["order.created", "order.updated", "session.opened", "session.closed"]} />
      <Link href={`/dashboard/${ctx.restaurant.id}/tables`} className="text-sm text-fg-muted hover:text-fg">
        ← {t("tableView.back")}
      </Link>
      <div className="mt-2">
        <PageHeader
          title={t("tableView.title", { label: view.table.label })}
          description={
            view.session
              ? t("tableView.since", { time: format.relativeTime(view.session.openedAt) })
              : t("tableView.freeBody")
          }
          actions={
            view.session && can(ctx, "sessions.close") ? (
              <CloseTableButton
                restaurantId={ctx.restaurant.id}
                tableId={view.table.id}
                label={view.table.label}
                canForce={can(ctx, "restaurant.manage")}
                size="md"
              />
            ) : null
          }
        />
      </div>
      {!view.session ? (
        <Card className="px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">{t("tableView.free")}</h2>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={t("tableView.tableTotal")} value={money(view.tableTotalCents)} />
            <StatCard label={t("tableView.unpaid")} value={money(view.unpaidCents)} />
            <StatCard
              label={t("tableView.people", { count: view.participants.length })}
              value={t("tableView.orders", { count: orderCount })}
            />
          </div>
          <div className="mt-6 space-y-6">
            {view.participants.map((p) => (
              <section key={p.id} aria-labelledby={`p-${p.id}`}>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 id={`p-${p.id}`} className="text-lg font-semibold">
                    {p.displayName ? `${p.displayName} · ` : ""}
                    {t("orders.client", { n: p.seq })}
                  </h2>
                  <p className="text-sm">
                    {t("tableView.clientTotal")}{" "}
                    <span className="font-semibold tabular-nums">{money(p.totalCents)}</span>
                    {p.unpaidCents ? (
                      <span className="text-fg-muted">
                        {" "}
                        · {t("tableView.unpaid")} {money(p.unpaidCents)}
                      </span>
                    ) : null}
                  </p>
                </div>
                {p.orders.length === 0 ? (
                  <p className="text-sm text-fg-subtle">{t("tableView.noOrdersYet")}</p>
                ) : (
                  <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {p.orders.map((o) => (
                      <li key={o.id}>
                        <OrderCard
                          restaurantId={ctx.restaurant.id}
                          order={{ ...o, participantSeq: p.seq, participantName: p.displayName }}
                          canUpdate={can(ctx, "orders.update_status")}
                          canCancel={can(ctx, "orders.cancel")}
                          timeZone={ctx.restaurant.timezone}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
