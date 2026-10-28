import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, ShellSkeleton } from "@/components/dashboard/app-shell";
import { IconChart, IconStore, IconUsers } from "@/components/ui/icons";
import { requireSuperAdmin } from "@/server/auth/current";
import { Bug, CreditCard, Eye, Music } from "lucide-react";

export default function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  const t = await getTranslations("nav");
  return (
    <AppShell
      title={t("admin")}
      subtitle="Super admin"
      brand="indigo"
      user={user}
      nav={[
        { href: "/admin", label: t("adminOverview"), icon: <IconChart />, exact: true, primary: true },
        { href: "/admin/restaurants", label: t("adminRestaurants"), icon: <IconStore />, primary: true },
        { href: "/admin/users", label: t("adminUsers"), icon: <IconUsers />, primary: true },
        { href: "/admin/music", label: t("adminMusic"), icon: <Music />, primary: true },
        { href: "/admin/plans", label: t("adminPlans"), icon: <CreditCard />, primary: true },
        { href: "/admin/audience", label: t("adminAudience"), icon: <Eye />, primary: true },
        { href: "/admin/errors", label: t("adminErrors"), icon: <Bug />, primary: true },
      ]}
    >
      {children}
    </AppShell>
  );
}
