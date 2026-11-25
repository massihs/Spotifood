import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { HelpEditor } from "@/components/support/help-editor";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listAllArticles } from "@/server/modules/support/help";
import { listCannedReplies } from "@/server/modules/support/service";

export default function AdminHelpPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-surface-2" />}>
      <Help />
    </Suspense>
  );
}

async function Help() {
  await requireSuperAdmin();
  const [t, articles, canned] = await Promise.all([
    getTranslations("support"),
    listAllArticles(db),
    listCannedReplies(db),
  ]);
  return (
    <>
      <PageHeader title={t("helpAdminTitle")} description={t("helpAdminSubtitle")} />
      <HelpEditor articles={articles} canned={canned} />
    </>
  );
}
