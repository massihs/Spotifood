import { Suspense } from "react";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { BellRing, ReceiptText, Search, Timer, Wallet } from "lucide-react";
import { formatMoney, normalizeDigits } from "@/lib/money";
import { PageHeader } from "@/components/dashboard/app-shell";
import { AcceptAllButton } from "@/components/dashboard/accept-all-button";
import { OnlinePause } from "@/components/dashboard/online-pause";
import { OrdersLayoutToggle } from "@/components/dashboard/orders-layout-toggle";
import { ORDERS_LAYOUT_COOKIE } from "@/lib/orders-layout";
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
import { onlineServiceStatus } from "@/server/modules/online/service";
import { getPaymentMethods } from "@/server/modules/payments/service";
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
  const [t, all, methods, online, jar] = await Promise.all([
    getTranslations("orders"),
    listActiveOrders(db, ctx),
    can(ctx, "payments.record") ? getPaymentMethods(db, ctx.restaurant.id) : null,
    onlineServiceStatus(db, ctx),
    cookies(),
  ]);
  // Cards filtered by step, or every step side by side; the choice stays on this device.
  const layout: "cards" | "board" =
    sp.layout === "board" || sp.layout === "cards"
      ? sp.layout
      : jar.get(ORDERS_LAYOUT_COOKIE)?.value === "board"
        ? "board"
        : "cards";
  const groups: Record<View, typeof all> = {
    active: all.filter((o) => ACTIVE_STATUSES.includes(o.status)),
    new: all.filter((o) => o.status === "received" || o.status === "pending_payment"),
    progress: all.filter((o) => o.status === "accepted" || o.status === "preparing"),
    ready: all.filter((o) => o.status === "ready"),
    done: all.filter((o) => !ACTIVE_STATUSES.includes(o.status)).reverse(),
  };
  const CHANNELS = ["dine_in", "takeaway", "delivery"] as const;
  const channel = (CHANNELS as readonly string[]).includes(String(sp.channel)) ? String(sp.channel) : null;
  const q = typeof sp.q === "string" ? normalizeDigits(sp.q).trim().toLowerCase().replace(/^#/, "") : "";
  const matches = (o: (typeof all)[number]) =>
    (!channel || o.channel === channel) &&
    (!q || o.number.toLowerCase().includes(q) || (o.tableLabel ?? "").toLowerCase() === q);
  const shown = groups[view].filter(matches);
  const base = `/dashboard/${ctx.restaurant.id}/orders`;
  const href = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const next = {
      view: view === "active" ? null : view,
      channel,
      q: q || null,
      layout: sp.layout === "board" || sp.layout === "cards" ? sp.layout : null,
      ...patch,
    };
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const stats = orderStats(groups.active);
  const locale = await getLocale();
  const money = (c: number) => formatMoney(c, ctx.restaurant.currency, locale);

  return (
    <>
      <LiveRefresh
        types={["order.created", "order.accepted", "order.updated", "session.opened", "session.closed"]}
      />
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            {online.enabled ? (
              <OnlinePause
                key={online.pausedUntil?.toISOString() ?? "open"}
                restaurantId={ctx.restaurant.id}
                pausedUntil={online.pausedUntil?.toISOString() ?? null}
                canPause={can(ctx, "orders.update_status")}
                timeZone={ctx.restaurant.timezone}
              />
            ) : null}
            {can(ctx, "orders.update_status") ? <TillAutoPrint restaurantId={ctx.restaurant.id} /> : null}
          </>
        }
      />
      <div className="-mx-4 mb-5 flex [scrollbar-width:none] gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0">
        {[
          {
            key: "active",
            value: String(groups.active.length),
            tone: "bg-accent-soft text-accent-text",
            icon: <ReceiptText className="size-5" aria-hidden="true" />,
          },
          {
            key: "ready",
            value: String(groups.ready.length),
            tone: groups.ready.length ? "bg-success-soft text-success" : "bg-surface-2 text-fg-muted",
            icon: <BellRing className="size-5" aria-hidden="true" />,
          },
          {
            key: "unpaid",
            value: money(stats.unpaidCents),
            tone: "bg-warning-soft text-warning",
            icon: <Wallet className="size-5" aria-hidden="true" />,
          },
          {
            key: "avgWait",
            value: stats.avgWait == null ? "—" : t("minutes", { n: stats.avgWait }),
            tone:
              stats.avgWait != null && stats.avgWait >= 20
                ? "bg-danger-soft text-danger"
                : "bg-info-soft text-info",
            icon: <Timer className="size-5" aria-hidden="true" />,
          },
        ].map((k) => (
          <div
            key={k.key}
            className="flex min-w-44 shrink-0 items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-[var(--shadow-soft)] ring-1 ring-border sm:min-w-0"
          >
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", k.tone)}>
              {k.icon}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg leading-tight font-black tabular-nums">{k.value}</span>
              <span className="block truncate text-xs text-fg-muted">{t(`kpi.${k.key}`)}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form
          action={base}
          className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-[var(--ring)] sm:max-w-xs"
        >
          {view !== "active" ? <input type="hidden" name="view" value={view} /> : null}
          {channel ? <input type="hidden" name="channel" value={channel} /> : null}
          <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </form>
        <div className="flex [scrollbar-width:none] gap-1 overflow-x-auto rounded-full bg-surface-2 p-1">
          {[null, ...CHANNELS].map((c) => (
            <Link
              key={c ?? "all"}
              href={href({ channel: c })}
              aria-current={channel === c ? "true" : undefined}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
                channel === c ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              )}
            >
              {t(`channels.${c ?? "all"}`)}
            </Link>
          ))}
        </div>
        <OrdersLayoutToggle
          layout={layout}
          cardsHref={href({ layout: "cards" })}
          boardHref={href({ layout: "board", view: null })}
        />
        {q || channel ? (
          <Link
            href={href({ q: null, channel: null })}
            className="text-sm font-semibold text-accent-text hover:underline"
          >
            {t("clear")}
          </Link>
        ) : null}
      </div>
      {layout === "board" ? (
        <OrdersBoard
          columns={(
            [
              ["new", groups.new.filter(matches), "bg-danger text-white"],
              ["progress", groups.progress.filter(matches), "bg-warning text-white"],
              ["ready", groups.ready.filter(matches), "bg-success text-white"],
            ] as const
          ).map(([key, orders, tone]) => ({ key, title: t(`views.${key}`), orders, tone }))}
          empty={t("layout.emptyColumn")}
          acceptAll={
            can(ctx, "orders.update_status")
              ? (ids: string[]) => (
                  <AcceptAllButton restaurantId={ctx.restaurant.id} orderIds={ids} size="md" />
                )
              : null
          }
          card={(o) => (
            <OrderCard
              restaurantId={ctx.restaurant.id}
              order={o}
              canUpdate={can(ctx, "orders.update_status")}
              canCancel={can(ctx, "orders.cancel")}
              timeZone={ctx.restaurant.timezone}
              collectMethods={methods?.offline}
            />
          )}
        />
      ) : null}
      {layout === "cards" ? (
        <nav
          className="-mx-4 mb-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4"
          aria-label={t("title")}
        >
          {VIEWS.map((key) => {
            const n = groups[key].length;
            return (
              <Link
                key={key}
                href={href({ view: key === "active" ? null : key })}
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
      ) : null}
      {layout === "cards" && can(ctx, "orders.update_status") && (view === "active" || view === "new")
        ? (() => {
            const fresh = shown.filter((o) => o.status === "received");
            return fresh.length > 1 ? (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3">
                <p className="min-w-0 flex-1 text-sm font-semibold">{t("newWaiting", { n: fresh.length })}</p>
                <AcceptAllButton
                  restaurantId={ctx.restaurant.id}
                  orderIds={fresh.map((o) => o.id)}
                  size="md"
                />
              </div>
            ) : null;
          })()
        : null}
      {layout === "board" ? null : shown.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 text-fg-subtle">
            <ReceiptText className="size-7" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">{q || channel ? t("noMatch") : t("empty")}</h2>
          {q || channel ? null : <p className="mx-auto mt-1 max-w-sm text-fg-muted">{t("emptyBody")}</p>}
        </Card>
      ) : (
        <ul className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((o) => (
            <li key={o.id}>
              <OrderCard
                restaurantId={ctx.restaurant.id}
                order={o}
                canUpdate={can(ctx, "orders.update_status")}
                canCancel={can(ctx, "orders.cancel")}
                timeZone={ctx.restaurant.timezone}
                collectMethods={methods?.offline}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

type ActiveOrder = Awaited<ReturnType<typeof listActiveOrders>>[number];

/**
 * Every step side by side (new → in the works → ready): the till sees the whole service at a
 * glance. Columns scroll sideways on a phone.
 */
function OrdersBoard({
  columns,
  empty,
  acceptAll,
  card,
}: {
  columns: { key: string; title: string; orders: ActiveOrder[]; tone: string }[];
  empty: string;
  acceptAll: ((ids: string[]) => React.ReactNode) | null;
  card: (o: ActiveOrder) => React.ReactNode;
}) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory [scrollbar-width:none] items-start gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
      {columns.map((c) => {
        const fresh = c.key === "new" ? c.orders.filter((o) => o.status === "received") : [];
        return (
          <section
            key={c.key}
            aria-label={c.title}
            className="w-[86vw] max-w-md shrink-0 snap-start rounded-3xl bg-surface-2/70 p-2 ring-1 ring-border sm:w-[26rem] lg:w-auto lg:max-w-none"
          >
            <header className="flex items-center gap-2 px-2.5 pt-1.5 pb-3">
              <h2 className="min-w-0 flex-1 truncate font-bold">{c.title}</h2>
              <span
                className={cn(
                  "grid h-6 min-w-6 place-items-center rounded-full px-2 text-xs font-black tabular-nums",
                  c.orders.length ? c.tone : "bg-surface text-fg-muted",
                )}
              >
                {c.orders.length}
              </span>
            </header>
            {acceptAll && fresh.length > 1 ? (
              <div className="mb-2 px-1">{acceptAll(fresh.map((o) => o.id))}</div>
            ) : null}
            {c.orders.length ? (
              <ul className="space-y-2">
                {c.orders.map((o) => (
                  <li key={o.id}>{card(o)}</li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-fg-muted">
                {empty}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Unpaid amount and average wait of the orders still in the works. */
function orderStats(active: { placedAt: Date; totalCents: number; paymentStatus: string; status: string }[]) {
  const now = Date.now();
  const unpaidCents = active
    .filter((o) => o.paymentStatus !== "paid")
    .reduce((sum, o) => sum + o.totalCents, 0);
  // Orders forgotten for hours would drown the average: only today's service counts.
  const waiting = active.filter(
    (o) =>
      o.status !== "ready" && o.status !== "served" && now - new Date(o.placedAt).getTime() < 6 * 3_600_000,
  );
  const avgWait = waiting.length
    ? Math.round(
        waiting.reduce((sum, o) => sum + (now - new Date(o.placedAt).getTime()), 0) / waiting.length / 60_000,
      )
    : null;
  return { unpaidCents, avgWait };
}
