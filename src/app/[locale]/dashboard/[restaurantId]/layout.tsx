import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, ShellSkeleton } from "@/components/dashboard/app-shell";
import { IconHome, IconChart } from "@/components/ui/icons";
import { requireRestaurant } from "@/server/auth/current";
import { Link } from "@/i18n/navigation";

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

  const nav = [{ href: base, label: t("nav.overview"), icon: <IconHome />, exact: true }];

  return (
    <AppShell
      title={ctx.restaurant.name}
      subtitle={t(`roles.${ctx.role}`)}
      nav={nav}
      user={ctx.user}
      footer={
        <div className="space-y-1">
          <Link
            href="/dashboard"
            className="block rounded-lg px-2.5 py-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            {t("nav.switchRestaurant")}
          </Link>
          {ctx.user.isSuperAdmin ? (
            <Link
              href="/admin"
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <span className="size-4" aria-hidden="true">
                <IconChart />
              </span>
              {t("nav.admin")}
            </Link>
          ) : null}
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
