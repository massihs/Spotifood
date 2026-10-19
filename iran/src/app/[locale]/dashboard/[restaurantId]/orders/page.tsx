import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { OrderCard } from "@/components/dashboard/order-card";
import { LiveRefresh } from "@/components/realtime/live";
import { TillAutoPrint } from "@/components/kitchen/till-auto-print";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { listActiveOrders } from "@/server/modules/orders/service";
import { ACTIVE_STATUSES } from "@/server/modules/orders/status";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/orders">;

export default function OrdersPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Orders params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "orders.view");
  const sp = await searchParams;
  const VIEWS = ["active", "new", "progress", "ready", "done"] as const;
  type View = (typeof VIEWS)[number];
  const view: View = (VIEWS as readonly string[]).includes(String(sp.view)) ? (sp.view as View) : "active";
  const [t, all] = await Promise.all([getTranslations("orders"), listActiveOrders(db, ctx)]);
  const groups: Record<View, typeof all> = {
    active: all.filter((o) => ACTIVE_STATUSES.includes(o.status)),
    new: all.filter((o) => o.status === "received" || o.status === "pending_payment"),
    progress: all.filter((o) => o.status === "accepted" || o.status === "preparing"),
    ready: all.filter((o) => o.status === "ready"),
    done: all.filter((o) => !ACTIVE_STATUSES.includes(o.status)).reverse(),
  };
  const shown = groups[view];
  const base = `/dashboard/${ctx.restaurant.id}/orders`;

  return (
    <>
      <LiveRefresh
        types={["order.created", "order.accepted", "order.updated", "session.opened", "session.closed"]}
      />
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={can(ctx, "orders.update_status") ? <TillAutoPrint restaurantId={ctx.restaurant.id} /> : null}
      />
      <nav
        className="-mx-4 mb-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4"
        aria-label={t("title")}
      >
        {VIEWS.map((key) => {
          const n = groups[key].length;
          return (
            <Link
              key={key}
              href={key === "active" ? base : `${base}?view=${key}`}
              aria-current={view === key ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap",
                view === key ? "bg-accent text-accent-fg" : "bg-surface text-fg-muted ring-1 ring-border",
              )}
            >
              {t(`views.${key}`)}
              <span
                className={cn(
                  "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                  view === key
                    ? "bg-white/25"
                    : key === "new" && n > 0
                      ? "bg-danger text-white"
                      : "bg-surface-2",
                )}
              >
                {n}
              </span>
            </Link>
          );
        })}
      </nav>
      {shown.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">{t("empty")}</h2>
          <p className="mx-auto mt-1 max-w-sm text-fg-muted">{t("emptyBody")}</p>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((o) => (
            <li key={o.id}>
              <OrderCard
                restaurantId={ctx.restaurant.id}
                order={o}
                canUpdate={can(ctx, "orders.update_status")}
                canCancel={can(ctx, "orders.cancel")}
                timeZone={ctx.restaurant.timezone}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
