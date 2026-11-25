import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { LiveProvider } from "@/components/realtime/live";
import { SupportInbox } from "@/components/support/support-inbox";
import { requireSuperAdmin } from "@/server/auth/current";

export default function AdminSupportPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-surface-2" />}>
      <Support />
    </Suspense>
  );
}

async function Support() {
  await requireSuperAdmin();
  const t = await getTranslations("support");
  return (
    <LiveProvider url="/api/v1/realtime/support">
      <PageHeader title={t("inboxTitle")} description={t("inboxSubtitle")} />
      <SupportInbox />
    </LiveProvider>
  );
}
