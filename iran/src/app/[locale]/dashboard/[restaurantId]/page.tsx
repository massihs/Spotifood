import {
  ConciergeBell,
  Shirt,
  AlertTriangle,
  ArrowRight,
  Bike,
  BellRing,
  Calculator,
  CalendarClock,
  ChartColumn,
  Check,
  CheckCheck,
  ChefHat,
  ChevronRight,
  Clock,
  Flame,
  LayoutGrid,
  ListChecks,
  QrCode,
  ReceiptText,
  Store,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { hotelToday } from "@/server/modules/hotel/requests";
import { HotelOverview } from "@/components/hotel/hotel-overview";
import { HourlyChart } from "@/components/dashboard/hourly-chart";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { OnlinePause } from "@/components/dashboard/online-pause";
import { QuickAvailability } from "@/components/dashboard/quick-availability";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, TONE_TILE, type Tone } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { jobHome } from "@/lib/jobs";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import {
  getOverviewLive,
  getSetupOverview,
  getTodayPulse,
  getTodayStats,
} from "@/server/modules/dashboard/service";
import { countToDispatch } from "@/server/modules/delivery/service";
import { countLowStock } from "@/server/modules/inventory/service";
import { onlineServiceStatus } from "@/server/modules/online/service";
import { countNewOrders } from "@/server/modules/orders/service";
import { can } from "@/server/tenancy";
import { getDisabledModules } from "@/server/modules/restaurants/settings";
import type { ModuleKey } from "@/lib/modules";

export default function OverviewPage({ params }: PageProps<"/[locale]/dashboard/[restaurantId]">) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      }
    >
      <Overview params={params} />
    </Suspense>
  );
}

/** Same chip colours as the order cards. */
const STATUS_CHIP: Record<string, string> = {
  pending_payment: "bg-surface-2 text-fg-muted",
  received: "bg-accent-soft text-accent-text",
  accepted: "bg-warning-soft text-fg",
  preparing: "bg-warning-soft text-fg",
  ready: "bg-success-soft text-success",
};

const minutesSince = (d: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / 60_000));

/** "12 min", "3 h", "2 d" in the locale's narrow units: an order forgotten overnight stays readable. */
function waited(min: number, locale: string) {
  const [n, unit] =
    min < 60
      ? [min, "minute"]
      : min < 1440
        ? [Math.floor(min / 60), "hour"]
        : [Math.floor(min / 1440), "day"];
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "narrow" }).format(n);
}

async function Overview({ params }: { params: PageProps<"/[locale]/dashboard/[restaurantId]">["params"] }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId);
  // Each job lands on its own screen: the kitchen and bar on their tickets, the till on the
  // orders to accept, waiters on the floor.
  const home = jobHome(ctx.restaurant.kind, ctx.job);
  if (home) redirect({ href: `/dashboard/${ctx.restaurant.id}/${home}`, locale: await getLocale() });
  const [
    t,
    tStatus,
    tRes,
    locale,
    overview,
    today,
    live,
    lowStock,
    newOrders,
    disabled,
    pulse,
    online,
    toDispatch,
  ] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("orderStatus"),
    getTranslations("reservations.status"),
    getLocale(),
    getSetupOverview(db, ctx),
    getTodayStats(db, ctx),
    getOverviewLive(db, ctx),
    countLowStock(db, ctx),
    countNewOrders(db, ctx),
    getDisabledModules(db, ctx),
    getTodayPulse(db, ctx),
    onlineServiceStatus(db, ctx),
    countToDispatch(db, ctx),
  ]);
  const hotel = ctx.restaurant.kind === "hotel" && can(ctx, "orders.view") ? await hotelToday(db, ctx) : null;
  const tz = ctx.restaurant.timezone;
  const money = (c: number) => formatMoney(c, ctx.restaurant.currency, locale);
  const base = `/dashboard/${ctx.restaurant.id}`;
  const on = (m: ModuleKey) => !disabled.includes(m);
  const now = today.asOf;
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const currentHour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(now),
  );

  const steps = [
    { key: "profile", done: overview.profileComplete, href: `${base}/settings#profile` },
    { key: "logo", done: overview.hasLogo, href: `${base}/settings#profile` },
    // An empty menu starts from the spreadsheet import: the fastest way in.
    {
      key: "menu",
      done: overview.products > 0,
      href: overview.products > 0 ? `${base}/menu` : `${base}/menu/import`,
    },
    { key: "tables", done: overview.tables > 0, href: `${base}/tables` },
    { key: "payments", done: overview.paymentsReady, href: `${base}/settings#payments` },
    { key: "firstOrder", done: overview.hasOrders, href: `${base}/tables` },
  ] as const;
  const doneCount = steps.filter((s) => s.done).length;

  // Last 7 days, oldest first, zero-filled.
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const centsOn = (key: string) => today.revenueByDay.find((r) => r.day === key)?.cents ?? 0;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86_400_000);
    const key = dayKey(d);
    return {
      key,
      label: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: tz }).format(d),
      cents: centsOn(key),
    };
  });
  const max = Math.max(1, ...days.map((d) => d.cents));
  const weekTotal = days.reduce((n, d) => n + d.cents, 0);
  // Against the same weekday last week at the same time of day: never a morning against a whole day.
  const pct = (now: number, then: number) =>
    then > 0 && now > 0 ? Math.round(((now - then) / then) * 100) : null;
  const revenueDelta = pct(today.revenueTodayCents, pulse.lastWeekSoFar.revenueCents);
  const ordersDelta = pct(today.ordersToday, pulse.lastWeekSoFar.orders);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: tz }).format(now);
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(now);

  // A hotel books rooms elsewhere: table bookings stay in its restaurant pages, off its home.
  const showReservations = !hotel && on("reservations") && can(ctx, "orders.view");
  const canOrders = can(ctx, "orders.view");
  const todo = [
    hotel &&
      hotel.open > 0 && {
        href: `${base}/requests`,
        label: t("hotel.alertOpen", { n: hotel.open }),
        hint: t("attention.requestsHint"),
        Icon: ConciergeBell,
        tone: "bg-danger text-white",
      },
    canOrders &&
      newOrders > 0 && {
        href: `${base}/orders?view=new`,
        label: t("alerts.newOrders", { n: newOrders }),
        hint: t("attention.newOrdersHint"),
        Icon: BellRing,
        tone: "bg-danger text-white",
      },
    canOrders &&
      pulse.steps.ready > 0 && {
        href: `${base}/orders?view=ready`,
        label: t("attention.ready", { n: pulse.steps.ready }),
        hint: t("attention.readyHint"),
        Icon: CheckCheck,
        tone: "bg-success-soft text-success",
      },
    on("delivery") &&
      toDispatch > 0 && {
        href: `${base}/delivery`,
        label: t("attention.dispatch", { n: toDispatch }),
        hint: t("attention.dispatchHint"),
        Icon: Bike,
        tone: TONE_TILE.sky,
      },
    showReservations &&
      live.pendingBookings > 0 && {
        href: `${base}/reservations`,
        label: t("alerts.pendingBookings", { n: live.pendingBookings }),
        hint: t("attention.bookingsHint"),
        Icon: CalendarClock,
        tone: TONE_TILE.fuchsia,
      },
    on("inventory") &&
      lowStock > 0 && {
        href: `${base}/inventory`,
        label: t("alerts.lowStock", { n: lowStock }),
        hint: t("attention.lowStockHint"),
        Icon: AlertTriangle,
        tone: "bg-warning-soft text-warning",
      },
    live.unpaidCents > 0 && {
      href: `${base}/orders`,
      label: t("alerts.unpaid", { amount: money(live.unpaidCents) }),
      hint: t("attention.unpaidHint"),
      Icon: Wallet,
      tone: "bg-surface-2 text-fg",
    },
    doneCount < steps.length &&
      can(ctx, "restaurant.manage") && {
        href: "#setup",
        label: t("attention.setup", { n: steps.length - doneCount }),
        hint: t("attention.setupHint"),
        Icon: ListChecks,
        tone: "bg-accent-soft text-accent-text",
      },
  ].filter((x) => !!x);

  const quick = [
    hotel && {
      href: `${base}/requests`,
      label: t("hotel.requests"),
      Icon: ConciergeBell,
      tone: "orange" as Tone,
    },
    hotel &&
      can(ctx, "members.manage") && {
        href: `${base}/requests?tab=services`,
        label: t("hotel.services"),
        Icon: Shirt,
        tone: "violet" as Tone,
      },
    on("pos") &&
      can(ctx, "orders.create") && {
        href: `${base}/pos`,
        label: t("quickActions.pos"),
        Icon: Calculator,
        tone: "emerald" as Tone,
      },
    on("kitchen") &&
      canOrders && {
        href: `${base}/kitchen`,
        label: t("quickActions.kitchen"),
        Icon: ChefHat,
        tone: "orange" as Tone,
      },
    !hotel &&
      on("floor") &&
      can(ctx, "tables.view") && {
        href: `${base}/floor`,
        label: t("quickActions.floor"),
        Icon: LayoutGrid,
        tone: "teal" as Tone,
      },
    showReservations && {
      href: `${base}/reservations`,
      label: t("quickActions.reservations"),
      Icon: CalendarClock,
      tone: "fuchsia" as Tone,
    },
    can(ctx, "menu.view") && {
      href: `${base}/menu`,
      label: t("quickActions.menu"),
      Icon: UtensilsCrossed,
      tone: "rose" as Tone,
    },
    can(ctx, "tables.view") && {
      href: `${base}/tables`,
      label: t("quickActions.qr"),
      Icon: QrCode,
      tone: "sky" as Tone,
    },
    can(ctx, "accounting.manage") && {
      href: `${base}/reports`,
      label: t("quickActions.reports"),
      Icon: ChartColumn,
      tone: "indigo" as Tone,
    },
  ].filter((x) => !!x);

  const seeAll = (href: string) => (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text hover:underline"
    >
      {t("seeAll")}
      <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
    </Link>
  );
  const channelMeta = {
    dine_in: { Icon: UtensilsCrossed, bar: "bg-accent", tile: "bg-accent-soft text-accent-text" },
    takeaway: { Icon: Store, bar: "bg-tone-sky", tile: TONE_TILE.sky },
    delivery: { Icon: Bike, bar: "bg-tone-violet", tile: TONE_TILE.violet },
  } as const;
  const channelTotal = pulse.channels.reduce((n, c) => n + c.cents, 0);

  return (
    <>
      <PageHeader
        title={t("welcome", { name: ctx.user.fullName.split(" ")[0] ?? "" })}
        description={<span className="first-letter:uppercase">{dateLabel}</span>}
        actions={
          <>
            {!hotel && online.enabled ? (
              <OnlinePause
                key={online.pausedUntil?.toISOString() ?? "open"}
                restaurantId={ctx.restaurant.id}
                pausedUntil={online.pausedUntil?.toISOString() ?? null}
                canPause={can(ctx, "orders.update_status")}
                timeZone={tz}
              />
            ) : null}
            {hotel ? (
              <Link href={`${base}/requests`} className={buttonClasses("primary")}>
                <ConciergeBell className="size-4" aria-hidden="true" />
                {t("hotel.requests")}
              </Link>
            ) : on("pos") && can(ctx, "orders.create") ? (
              <Link href={`${base}/pos`} className={buttonClasses("primary")}>
                <Calculator className="size-4" aria-hidden="true" />
                {t("quickActions.pos")}
              </Link>
            ) : null}
          </>
        }
      />

      {/* Shortcuts: one row, scrolls on phones */}
      <nav
        aria-label={t("quick")}
        className="-mx-4 mb-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {!hotel && overview.products > 0 && (can(ctx, "menu.manage") || can(ctx, "orders.update_status")) ? (
          <QuickAvailability restaurantId={ctx.restaurant.id} variant="chip" />
        ) : null}
        {quick.map(({ href, label, Icon, tone }) => (
          <Link
            key={href}
            href={href}
            className="group inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-surface ps-1.5 pe-3.5 text-sm font-semibold whitespace-nowrap shadow-[var(--shadow-soft)] transition-[border-color,background-color,transform] hover:border-accent/40 hover:bg-accent-soft/40 active:scale-[0.97]"
          >
            <span className={cn("grid size-7 place-items-center rounded-full", TONE_TILE[tone])}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-3">
        {hotel ? (
          <div className="lg:col-span-2">
            <HotelOverview ctx={ctx} today={hotel} money={money} asOf={now} />
          </div>
        ) : (
          /* Today: revenue, its trend at this time of day, and the day's rhythm hour by hour */
          <Card className="p-5 sm:p-6 lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-fg-muted">
                  <span
                    className="grid size-7 place-items-center rounded-lg text-white"
                    style={{ background: "var(--brand-gradient)" }}
                    aria-hidden="true"
                  >
                    <Wallet className="size-4" />
                  </span>
                  {t("revenueToday")}
                </p>
                <p className="mt-2 text-3xl font-black tracking-tight tabular-nums sm:text-4xl">
                  {money(today.revenueTodayCents)}
                </p>
                <Trend delta={revenueDelta} label={t("vsSameTime", { day: weekday })} />
              </div>
              <dl className="grid grid-cols-3 gap-x-5 gap-y-1 sm:gap-x-8">
                <Mini label={t("ordersToday")} delta={ordersDelta}>
                  {today.ordersToday}
                </Mini>
                <Mini label={t("averageTicket")}>{money(today.averageTicketCents)}</Mini>
                <Mini label={t("openTables")}>
                  {today.openTables}
                  <span className="text-sm font-medium text-fg-subtle"> / {overview.tables}</span>
                </Mini>
              </dl>
            </div>
            <div className="mt-6">
              <HourlyChart
                today={pulse.hourly.today}
                lastWeek={pulse.hourly.lastWeek}
                currentHour={currentHour}
                locale={locale}
                money={money}
                todayLabel={t("chart.today")}
                lastWeekLabel={t("chart.lastWeek", { day: weekday })}
                summary={t("chart.summary", { day: weekday })}
                emptyLabel={t("chart.empty")}
              />
            </div>
          </Card>
        )}

        {/* What needs someone now */}
        <Card className="order-first flex flex-col lg:order-none">
          <CardHeader title={t("attention.title")} />
          {todo.length ? (
            <ul className="divide-y divide-border">
              {todo.map(({ href, label, hint, Icon, tone }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2"
                  >
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tone)}>
                      <Icon className="size-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{label}</span>
                      <span className="block truncate text-xs text-fg-muted">{hint}</span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-success-soft text-success">
                <Check className="size-6" strokeWidth={3} aria-hidden="true" />
              </span>
              <p className="font-bold">{t("attention.clear")}</p>
              <p className="text-sm text-fg-muted">{t("attention.clearHint")}</p>
            </div>
          )}
        </Card>
      </div>

      {!hotel ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Where today's sales come from */}
          <Card className="flex flex-col">
            <CardHeader title={t("channels.title")} />
            {pulse.channels.length ? (
              <div className="space-y-4 p-5">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                  {pulse.channels.map((c) => (
                    <span
                      key={c.channel}
                      className={channelMeta[c.channel].bar}
                      style={{ width: `${channelTotal ? (c.cents / channelTotal) * 100 : 0}%` }}
                    />
                  ))}
                </div>
                <ul className="space-y-3">
                  {pulse.channels.map((c) => {
                    const M = channelMeta[c.channel];
                    return (
                      <li key={c.channel} className="flex items-center gap-3">
                        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", M.tile)}>
                          <M.Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{t(`channels.${c.channel}`)}</span>
                          <span className="block text-xs text-fg-muted">{t("ordersN", { n: c.orders })}</span>
                        </span>
                        <span className="text-end">
                          <span className="block text-sm font-bold tabular-nums">{money(c.cents)}</span>
                          <span className="block text-xs text-fg-subtle tabular-nums">
                            {new Intl.NumberFormat(locale, { style: "percent" }).format(
                              channelTotal ? c.cents / channelTotal : 0,
                            )}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <Empty icon={<Store />} text={t("channels.empty")} />
            )}
          </Card>

          {/* The kitchen right now */}
          {canOrders ? (
            <Card className="flex flex-col">
              <CardHeader
                title={t("pipeline.title")}
                action={on("kitchen") ? seeAll(`${base}/kitchen`) : undefined}
              />
              <div className="grid flex-1 grid-cols-3 gap-2 p-5">
                {(
                  [
                    ["received", pulse.steps.received, "new", "bg-danger-soft text-danger"],
                    ["preparing", pulse.steps.preparing, "progress", "bg-warning-soft text-warning"],
                    ["ready", pulse.steps.ready, "ready", "bg-success-soft text-success"],
                  ] as const
                ).map(([key, n, view, tone]) => (
                  <Link
                    key={key}
                    href={`${base}/orders?view=${view}`}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-4 text-center transition-transform hover:-translate-y-0.5",
                      n ? tone : "bg-surface-2 text-fg-muted",
                    )}
                  >
                    <span className="text-3xl font-black tabular-nums">{n}</span>
                    <span className="text-xs font-semibold">{t(`pipeline.${key}`)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}

          {/* The week */}
          <Card className="flex flex-col md:col-span-2 xl:col-span-1">
            <CardHeader
              title={t("last7")}
              action={
                <span className="text-sm font-bold text-fg-muted tabular-nums">{money(weekTotal)}</span>
              }
            />
            <div className="flex flex-1 items-end gap-2 p-5">
              {days.map((d, i) => (
                <div
                  key={d.key}
                  className="group flex h-36 flex-1 flex-col items-center justify-end gap-1.5"
                  title={money(d.cents)}
                >
                  <div
                    className={cn(
                      "w-full origin-bottom animate-[bar-grow_0.6s_cubic-bezier(0.2,0.7,0.2,1)_both] rounded-md",
                      i === 6 ? "bg-accent" : "bg-accent/25 group-hover:bg-accent/45",
                    )}
                    style={{
                      height: `${Math.max(4, (d.cents / max) * 100)}%`,
                      animationDelay: `${i * 40}ms`,
                    }}
                  />
                  <span className={cn("text-[11px]", i === 6 ? "font-bold" : "text-fg-muted")}>
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {doneCount < steps.length ? (
        <Card id="setup" className="mt-4 scroll-mt-24">
          <CardHeader
            title={t("setupTitle")}
            description={t("setupSubtitle")}
            action={
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-text tabular-nums">
                {doneCount}/{steps.length}
              </span>
            }
          />
          <ol className="grid gap-1 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-2",
                    !s.done && "font-medium",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                      s.done ? "bg-accent text-accent-fg" : "text-fg-muted ring-1 ring-border-strong",
                    )}
                    aria-hidden="true"
                  >
                    {s.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={cn("text-sm", s.done && "text-fg-muted line-through")}>
                    {t(`setup.${s.key}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <Suspense fallback={null}>
        <KpiCard ctx={ctx} canManage={can(ctx, "restaurant.manage")} />
      </Suspense>

      <div className={cn("mt-4 grid gap-4", showReservations ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {/* Live orders, oldest first: what the team should look at next */}
        {can(ctx, "orders.view") ? (
          <Card className="flex flex-col">
            <CardHeader title={t("liveOrders")} action={seeAll(`${base}/orders`)} />
            {live.active.length ? (
              <ul className="divide-y divide-border">
                {live.active.map((o) => {
                  const min = minutesSince(o.placedAt, now);
                  const late = o.status !== "ready" && min >= 20;
                  const warn = o.status !== "ready" && min >= 10;
                  return (
                    <li key={o.id}>
                      <Link
                        href={`${base}/orders`}
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                      >
                        <span
                          className={cn(
                            "grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-accent-soft px-1 font-bold text-accent-text tabular-nums",
                            (o.tableLabel?.length ?? 0) > 3 ? "text-[10px] break-all" : "text-sm",
                          )}
                          aria-hidden="true"
                        >
                          {o.tableLabel ?? "—"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <bdi dir="ltr" className="font-bold tabular-nums">
                              #{o.number}
                            </bdi>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                                STATUS_CHIP[o.status],
                              )}
                            >
                              {tStatus(o.status)}
                            </span>
                          </span>
                          <span className="block text-xs text-fg-muted tabular-nums">
                            {money(o.totalCents)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                            late
                              ? "bg-danger text-white"
                              : warn
                                ? "bg-warning-soft text-warning"
                                : "bg-surface-2 text-fg-muted",
                          )}
                        >
                          <Clock className="size-3" aria-hidden="true" />
                          {waited(min, locale)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty icon={<ReceiptText />} text={t("noLiveOrders")} />
            )}
          </Card>
        ) : null}

        {showReservations ? (
          <Card className="flex flex-col">
            <CardHeader title={t("nextBookings")} action={seeAll(`${base}/reservations`)} />
            {live.bookings.length ? (
              <ul className="divide-y divide-border">
                {live.bookings.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-14 shrink-0 text-sm font-bold tabular-nums">
                      <bdi dir="ltr">{time.format(b.startsAt)}</bdi>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{b.name}</span>
                      <span className="block text-xs text-fg-muted">{t("partyN", { n: b.partySize })}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                        b.status === "pending"
                          ? "bg-warning-soft text-warning"
                          : "bg-tone-fuchsia/12 text-tone-fuchsia",
                      )}
                    >
                      {tRes(b.status)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={<CalendarClock />} text={t("noBookingsToday")} />
            )}
          </Card>
        ) : null}

        <Card className="flex flex-col">
          <CardHeader
            title={t("topProducts")}
            action={can(ctx, "accounting.manage") ? seeAll(`${base}/reports?tab=products`) : undefined}
          />
          {live.top.length ? (
            <ol className="space-y-3 p-5">
              {live.top.map((p, i) => (
                <li key={p.name} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-black tabular-nums",
                      i === 0 ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-muted",
                    )}
                  >
                    {i === 0 ? <Flame className="size-4" aria-hidden="true" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                      <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                        {t("soldN", { n: p.quantity })}
                      </span>
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${(p.quantity / live.top[0]!.quantity) * 100}%` }}
                      />
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty icon={<Flame />} text={t("noSales")} />
          )}
        </Card>
      </div>
    </>
  );
}

/** "+12 % vs Monday at this time": nothing before the first sale, nothing without a reference. */
function Trend({ delta, label }: { delta: number | null; label: string }) {
  if (delta === null) return null;
  const up = delta >= 0;
  return (
    <p
      className={cn(
        "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        up ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
      )}
    >
      {up ? (
        <TrendingUp className="size-3.5" aria-hidden="true" />
      ) : (
        <TrendingDown className="size-3.5" aria-hidden="true" />
      )}
      <bdi dir="ltr" className="tabular-nums">
        {delta > 0 ? "+" : ""}
        {delta}%
      </bdi>
      <span className="font-medium opacity-85">{label}</span>
    </p>
  );
}

function Mini({ label, delta, children }: { label: string; delta?: number | null; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-fg-muted">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        <span className="truncate text-lg font-black tabular-nums sm:text-xl">{children}</span>
        {delta != null ? (
          <bdi
            dir="ltr"
            className={cn("text-xs font-bold tabular-nums", delta >= 0 ? "text-success" : "text-danger")}
          >
            {delta > 0 ? "+" : ""}
            {delta}%
          </bdi>
        ) : null}
      </dd>
    </div>
  );
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10 text-center text-sm text-fg-muted">
      <span className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-fg-subtle [&_svg]:size-5">
        {icon}
      </span>
      {text}
    </div>
  );
}
