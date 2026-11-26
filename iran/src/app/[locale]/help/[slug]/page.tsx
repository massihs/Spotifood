import { ArrowRight } from "@/components/icons";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { getHelpArticle } from "@/server/modules/support/help";

type Props = PageProps<"/[locale]/help/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "support" });
  return { title: t("helpCenter") };
}

export default function HelpArticlePage({ params }: Props) {
  return (
    <div className="min-h-dvh bg-bg">
      <Suspense
        fallback={<div className="mx-auto mt-24 h-60 max-w-2xl animate-pulse rounded-3xl bg-surface-2" />}
      >
        <Article params={params} />
      </Suspense>
    </div>
  );
}

async function Article({ params }: Pick<Props, "params">) {
  await connection();
  const { slug } = await params;
  const [t, locale] = await Promise.all([getTranslations("support"), getLocale()]);
  const a = await getHelpArticle(db, locale, slug).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Link
          href="/help"
          className="kashi-btn inline-flex h-9 items-center gap-1.5 px-3 text-sm font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <ArrowRight className="size-4 ltr:rotate-180" aria-hidden="true" />
          {t("helpCenter")}
        </Link>
        <article className="mt-3 rounded-3xl border border-border/80 bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{a.title}</h1>
          <p className="mt-5 text-[16px] leading-8 whitespace-pre-line">{a.body}</p>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
