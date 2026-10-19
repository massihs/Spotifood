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
  Music,
  QrCode,
  ReceiptText,
  Settings,
  Shield,
  UtensilsCrossed,
  Users,
  Wallet,
} from "lucide-react";
import { logoUrl } from "@/server/modules/restaurants/settings";
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

  const [{ unread }, newOrders, lowStock, undeliveredCount] = await Promise.all([
    listNotifications(db, ctx, 1),
    countNewOrders(db, ctx),
    countLowStock(db, ctx),
    countToDispatch(db, ctx),
  ]);
  const g = {
    ops: t("nav.groups.ops"),
    catalog: t("nav.groups.catalog"),
    business: t("nav.groups.business"),
    manage: t("nav.groups.manage"),
  };
  const nav = [
    {
      href: base,
      label: t("nav.overview"),
      icon: <LayoutDashboard />,
      exact: true,
      primary: true,
      group: g.ops,
    },
    can(ctx, "orders.view") && {
      href: `${base}/kitchen`,
      label: t("nav.kitchen"),
      icon: <ChefHat />,
      primary: true,
      badge: newOrders,
      group: g.ops,
    },
    can(ctx, "orders.create") && {
      href: `${base}/pos`,
      label: t("nav.pos"),
      icon: <Calculator />,
      group: g.ops,
    },
    can(ctx, "orders.view") && {
      href: `${base}/orders`,
      label: t("nav.orders"),
      icon: <ReceiptText />,
      primary: true,
      badge: newOrders,
      group: g.ops,
    },
    can(ctx, "orders.view") && {
      href: `${base}/delivery`,
      label: t("nav.delivery"),
      icon: <Bike />,
      group: g.ops,
      badge: undeliveredCount,
    },
    can(ctx, "orders.view") && {
      href: `${base}/reservations`,
      label: t("nav.reservations"),
      icon: <CalendarClock />,
      group: g.ops,
    },
    can(ctx, "tables.view") && {
      href: `${base}/floor`,
      label: t("nav.floor"),
      icon: <LayoutGrid />,
      group: g.ops,
    },
    can(ctx, "menu.view") && {
      href: `${base}/menu`,
      label: t("nav.menu"),
      icon: <UtensilsCrossed />,
      primary: true,
      group: g.catalog,
    },
    can(ctx, "inventory.view") && {
      href: `${base}/inventory`,
      label: t("nav.inventory"),
      icon: <Boxes />,
      badge: lowStock,
      group: g.catalog,
    },
    can(ctx, "tables.view") && {
      href: `${base}/tables`,
      label: t("nav.tables"),
      icon: <QrCode />,
      group: g.catalog,
    },
    can(ctx, "customers.view") && {
      href: `${base}/customers`,
      label: t("nav.customers"),
      icon: <HeartHandshake />,
      group: g.business,
    },
    can(ctx, "accounting.manage") && {
      href: `${base}/reports`,
      label: t("nav.reports"),
      icon: <ChartColumn />,
      group: g.business,
    },
    can(ctx, "payments.view") && {
      href: `${base}/payments`,
      label: t("nav.payments"),
      icon: <Wallet />,
      group: g.business,
    },
    can(ctx, "invoices.view") && {
      href: `${base}/invoices`,
      label: t("nav.invoices"),
      icon: <FileText />,
      group: g.business,
    },
    ctx.role !== "staff" && {
      href: `${base}/branches`,
      label: t("nav.branches"),
      icon: <Network />,
      group: g.manage,
    },
    can(ctx, "restaurant.view") && {
      href: `${base}/music`,
      label: t("nav.music"),
      icon: <Music />,
      group: g.manage,
    },
    can(ctx, "members.manage") && {
      href: `${base}/team`,
      label: t("nav.team"),
      icon: <Users />,
      group: g.manage,
    },
    can(ctx, "restaurant.view") && {
      href: `${base}/settings`,
      label: t("nav.settings"),
      icon: <Settings />,
      group: g.manage,
    },
  ].filter((x) => !!x);

  return (
    <LiveProvider url={`/api/v1/realtime/restaurant/${ctx.restaurant.id}`}>
      <AppShell
        title={ctx.restaurant.name}
        subtitle={t(`roles.${ctx.role}`)}
        avatar={logoUrl(ctx.restaurant.logoKey)}
        brand={ctx.restaurant.brandColor}
        nav={nav}
        user={ctx.user}
        headerExtra={
          <>
            <OrderAlerts restaurantId={ctx.restaurant.id} newOrders={newOrders} />
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
