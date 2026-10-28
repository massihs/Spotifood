import { Check } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { buttonClasses } from "@/components/ui/button";
import { edition } from "@/config/edition";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db/client";
import { TRIAL_DAYS, billingEnabled, listPublicPlans } from "@/server/modules/billing/service";
import { planFeatureLines } from "@/server/modules/billing/features";

type Props = PageProps<"/[locale]/pricing">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing" });
  return { title: { absolute: t("metaTitle") }, description: t("subtitle") };
}

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing");
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader active="pricing" />
      <main className="mx-auto max-w-6xl px-4 pt-12 pb-20 sm:px-6 sm:pt-16">
        <h1 className="text-center text-3xl font-bold tracking-tight text-balance sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-center text-base text-pretty text-fg-muted sm:text-lg">
          {t("subtitle")}
        </p>
        <Suspense fallback={<div className="mt-12 h-96 animate-pulse rounded-3xl bg-surface-2" />}>
          <Plans />
        </Suspense>
        <p className="mt-10 text-center text-sm text-fg-muted">{t("yearly")}</p>
      </main>
      <SiteFooter />
    </div>
  );
}

async function Plans() {
  // Plans live in the database (Admin > Plans): read at request time.
  await connection();
  const [t, tb, locale, plans] = await Promise.all([
    getTranslations("pricing"),
    getTranslations("billing"),
    getLocale(),
    listPublicPlans(db),
  ]);
  const trial = billingEnabled();
  const highlight = "professional";
  return (
    <>
      {trial ? (
        <p className="mx-auto mt-6 w-fit rounded-full bg-accent-soft px-4 py-1.5 text-sm font-semibold text-accent-text">
          {t("trial", { days: TRIAL_DAYS })}
        </p>
      ) : null}
      <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const hot = p.code === highlight;
          const custom = p.priceMonthlyCents === 0 && p.code !== "free";
          return (
            <li
              key={p.id}
              className={cn(
                "flex flex-col rounded-3xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border",
                hot && "ring-2 ring-accent",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">{p.name}</h2>
                {hot ? (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-fg">
                    {t("popular")}
                  </span>
                ) : null}
              </div>
              <p className="mt-4">
                {custom ? (
                  <span className="text-2xl font-bold">{t("onQuote")}</span>
                ) : p.priceMonthlyCents === 0 ? (
                  <span className="text-3xl font-bold">{t("free")}</span>
                ) : (
                  <>
                    <span className="text-3xl font-bold tabular-nums">
                      {formatMoney(p.priceMonthlyCents, edition.platformCurrency, locale)}
                    </span>{" "}
                    <span className="text-sm text-fg-muted">{tb("perMonth")}</span>
                  </>
                )}
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {planFeatureLines(p.limits, tb).map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={custom ? "/#contact" : "/signup"}
                className={cn(buttonClasses(hot ? "accent" : "secondary", "md"), "mt-6 w-full")}
              >
                {custom ? t("contact") : t("start")}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
