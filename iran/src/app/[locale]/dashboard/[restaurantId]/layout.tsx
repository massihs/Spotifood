import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, ShellSkeleton } from "@/components/dashboard/app-shell";
import {
  Boxes,
  HeartHandshake,
  ChartColumn,
  Bike,
  CalendarClock,
  Network,
  Calculator,
  ChefHat,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  NotebookPen,
  Music,
  QrCode,
  ReceiptText,
  Settings,
  Shield,
  UtensilsCrossed,
  Users,
  Wallet,
} from "lucide-react";
import { getDisabledModules, logoUrl } from "@/server/modules/restaurants/settings";
import type { ModuleKey } from "@/lib/modules";
import type { NavItem } from "@/components/dashboard/sidebar-nav";
import type { SearchEntry } from "@/components/dashboard/command-palette";
import { can } from "@/server/tenancy";
import { requireRestaurant } from "@/server/auth/current";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { listNotifications } from "@/server/modules/notifications/service";
import { LiveProvider } from "@/components/realtime/live";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { OrderAlerts } from "@/components/dashboard/order-alerts";
import { countNewOrders } from "@/server/modules/orders/service";
import { countLowStock } from "@/server/modules/inventory/service";
import { countToDispatch } from "@/server/modules/delivery/service";

export default function RestaurantLayout({
  children,
  params,
}: LayoutProps<"/[locale]/dashboard/[restaurantId]">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <RestaurantShell params={params}>{children}</RestaurantShell>
    </Suspense>
  );
}

async function RestaurantShell({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutProps<"/[locale]/dashboard/[restaurantId]">["params"];
}) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId);
  const t = await getTranslations();
  const base = `/dashboard/${ctx.restaurant.id}`;

  const [{ unread }, newOrders, lowStock, undeliveredCount, disabled] = await Promise.all([
    listNotifications(db, ctx, 1),
    countNewOrders(db, ctx),
    countLowStock(db, ctx),
    countToDispatch(db, ctx),
    getDisabledModules(db, ctx),
  ]);
  const off = new Set(disabled);
  const on = (m: ModuleKey) => !off.has(m);
  const g = {
    sales: t("nav.groups.sales"),
    catalog: t("nav.groups.catalog"),
    guests: t("nav.groups.guests"),
    finance: t("nav.groups.finance"),
    manage: t("nav.groups.manage"),
  };
  type Item = NavItem & { show: boolean };
  const nav: NavItem[] = (
    [
      {
        show: true,
        href: base,
        label: t("nav.overview"),
        icon: <LayoutDashboard />,
        exact: true,
        primary: true,
      },
      // Sales & service: everything that happens during a shift.
      {
        show: on("pos") && can(ctx, "orders.create"),
        href: `${base}/pos`,
        label: t("nav.pos"),
        icon: <Calculator />,
        primary: true,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: on("floor") && can(ctx, "orders.create") && can(ctx, "tables.view"),
        href: `${base}/waiter`,
        label: t("nav.waiter"),
        icon: <NotebookPen />,
        primary: true,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: can(ctx, "orders.view"),
        href: `${base}/orders`,
        label: t("nav.orders"),
        icon: <ReceiptText />,
        primary: true,
        badge: newOrders,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: on("kitchen") && can(ctx, "orders.view"),
        href: `${base}/kitchen`,
        label: t("nav.kitchen"),
        icon: <ChefHat />,
        primary: true,
        badge: newOrders,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: on("floor") && can(ctx, "tables.view"),
        href: `${base}/floor`,
        label: t("nav.floor"),
        icon: <LayoutGrid />,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: on("delivery") && can(ctx, "orders.view"),
        href: `${base}/delivery`,
        label: t("nav.delivery"),
        icon: <Bike />,
        badge: undeliveredCount,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: on("reservations") && can(ctx, "orders.view"),
        href: `${base}/reservations`,
        label: t("nav.reservations"),
        icon: <CalendarClock />,
        groupKey: "sales",
        group: g.sales,
      },
      // Menu & stock: what the restaurant sells and where it is served.
      {
        show: can(ctx, "menu.view"),
        href: `${base}/menu`,
        label: t("nav.menu"),
        icon: <UtensilsCrossed />,
        primary: true,
        groupKey: "catalog",
        group: g.catalog,
      },
      {
        show: on("inventory") && can(ctx, "inventory.view"),
        href: `${base}/inventory`,
        label: t("nav.inventory"),
        icon: <Boxes />,
        badge: lowStock,
        groupKey: "catalog",
        group: g.catalog,
      },
      {
        show: can(ctx, "tables.view"),
        href: `${base}/tables`,
        label: t("nav.tables"),
        icon: <QrCode />,
        groupKey: "catalog",
        group: g.catalog,
      },
      // Guests & experience.
      {
        show: on("customers") && can(ctx, "customers.view"),
        href: `${base}/customers`,
        label: t("nav.customers"),
        icon: <HeartHandshake />,
        groupKey: "guests",
        group: g.guests,
      },
      {
        show: on("music") && can(ctx, "restaurant.view"),
        href: `${base}/music`,
        label: t("nav.music"),
        icon: <Music />,
        groupKey: "guests",
        group: g.guests,
      },
      // Finance.
      {
        show: can(ctx, "accounting.manage"),
        href: `${base}/reports`,
        label: t("nav.reports"),
        icon: <ChartColumn />,
        groupKey: "finance",
        group: g.finance,
      },
      {
        show: can(ctx, "payments.view"),
        href: `${base}/payments`,
        label: t("nav.payments"),
        icon: <Wallet />,
        groupKey: "finance",
        group: g.finance,
      },
      {
        show: on("invoices") && can(ctx, "invoices.view"),
        href: `${base}/invoices`,
        label: t("nav.invoices"),
        icon: <FileText />,
        groupKey: "finance",
        group: g.finance,
      },
      // Management.
      {
        show: on("branches") && ctx.role !== "staff",
        href: `${base}/branches`,
        label: t("nav.branches"),
        icon: <Network />,
        groupKey: "manage",
        group: g.manage,
      },
      {
        show: can(ctx, "members.manage"),
        href: `${base}/team`,
        label: t("nav.team"),
        icon: <Users />,
        groupKey: "manage",
        group: g.manage,
      },
      {
        show: can(ctx, "restaurant.view"),
        href: `${base}/settings`,
        label: t("nav.settings"),
        icon: <Settings />,
        groupKey: "manage",
        group: g.manage,
      },
    ] satisfies Item[]
  )
    .filter((i) => i.show)
    .map(({ show: _show, ...i }) => i);

  // Go-anywhere search also reaches the tabs inside pages and the settings sections.
  const visible = new Set(nav.map((n) => n.href));
  const sub = (page: string, ns: string, tabs: readonly string[], key = "tab") =>
    visible.has(`${base}/${page}`)
      ? tabs.map((k) => ({
          href: `${base}/${page}?${key}=${k}`,
          label: t(`${ns}.tabs.${k}`),
          hint: t(`nav.${page}`),
        }))
      : [];
  const search: SearchEntry[] = [
    ...sub("reports", "reports", ["sales", "products", "expenses", "security"]),
    ...sub("inventory", "inventory", ["purchases", "recipes", "suppliers", "movements"]),
    ...sub("customers", "customers", ["coupons", "campaigns", "loyalty"]),
    ...sub("delivery", "delivery", ["settlement", "settings"]),
    ...sub("reservations", "reservations", ["queue", "settings"]),
    ...(visible.has(`${base}/settings`)
      ? (["profile", "service", "payments", "taxes", "legal", "modules", "printers", "listing"] as const).map(
          (k) => ({
            href: `${base}/settings#${k}`,
            label: t(`settings.${k}`),
            hint: t("nav.settings"),
          }),
        )
      : []),
  ];

  return (
    <LiveProvider url={`/api/v1/realtime/restaurant/${ctx.restaurant.id}`}>
      <AppShell
        title={ctx.restaurant.name}
        subtitle={t(`roles.${ctx.role}`)}
        avatar={logoUrl(ctx.restaurant.logoKey)}
        brand={ctx.restaurant.brandColor}
        nav={nav}
        search={search}
        user={ctx.user}
        headerExtra={
          <>
            <OrderAlerts
              restaurantId={ctx.restaurant.id}
              newOrders={newOrders}
              kitchen={ctx.job === "kitchen" || ctx.job === "bar"}
            />
            <NotificationBell
              restaurantId={ctx.restaurant.id}
              timeZone={ctx.restaurant.timezone}
              initialUnread={unread}
            />
          </>
        }
        footer={
          <div className="space-y-1">
            <Link
              href="/dashboard"
              className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
              {t("nav.switchRestaurant")}
            </Link>
            {ctx.user.isSuperAdmin ? (
              <Link
                href="/admin"
                className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <Shield className="size-4" aria-hidden="true" />
                {t("nav.admin")}
              </Link>
            ) : null}
          </div>
        }
      >
        {children}
      </AppShell>
    </LiveProvider>
  );
}
