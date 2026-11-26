import { Check, ChevronDown, CreditCard, FileText, Minus, Smartphone } from "@/components/icons";
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

export default async function PricingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing");
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader active="pricing" />
      <main className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] bg-gradient-to-b from-accent-soft/80 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute start-1/2 -top-40 size-[36rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
          <p className="kashi-btn kashi-frame mx-auto w-fit px-3.5 py-1 text-xs font-bold text-accent-text shadow-[var(--shadow-soft)] [--cut:5px] [--kashi-fill:var(--surface)]">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 text-center text-3xl font-black tracking-tight text-balance sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-center text-base text-pretty text-fg-muted sm:text-lg">
            {t("subtitle")}
          </p>
          <Suspense fallback={<div className="mt-12 h-96 animate-pulse rounded-3xl bg-surface-2" />}>
            <Plans searchParams={searchParams} />
          </Suspense>
          <TrustStrip />
          <Faq />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** The default plans have a translated name and a one-line "for whom"; renamed or new plans keep theirs. */
const KNOWN = ["free", "starter", "professional", "enterprise"];

async function Plans({ searchParams }: { searchParams: Props["searchParams"] }) {
  // Plans live in the database (Admin > Plans): read at request time.
  await connection();
  const [t, tb, locale, plans, sp] = await Promise.all([
    getTranslations("pricing"),
    getTranslations("billing"),
    getLocale(),
    listPublicPlans(db),
    searchParams,
  ]);
  const trial = billingEnabled();
  const highlight = "professional";
  const yearly = sp.period === "yearly";
  const name = (p: { code: string; name: string }) =>
    KNOWN.includes(p.code) ? t(`plans.${p.code}.name`) : p.name;
  const money = (c: number) => formatMoney(c, edition.platformCurrency, locale);
  return (
    <>
      {trial ? (
        <p className="kashi-btn mx-auto mt-6 w-fit bg-accent-soft px-4 py-1.5 text-sm font-semibold text-accent-text">
          {t("trial", { days: TRIAL_DAYS })}
        </p>
      ) : null}
      {/* Monthly or yearly (12 months for the price of 10). */}
      <div className="mx-auto mt-8 flex w-fit items-center gap-1 rounded-full bg-surface p-1 shadow-[var(--shadow-soft)] ring-1 ring-border">
        {(["monthly", "yearly"] as const).map((k) => (
          <Link
            key={k}
            href={k === "yearly" ? "/pricing?period=yearly" : "/pricing"}
            scroll={false}
            aria-current={(k === "yearly") === yearly ? "true" : undefined}
            className={cn(
              "kashi-btn inline-flex h-10 items-center gap-2 px-5 text-sm font-bold transition-colors",
              (k === "yearly") === yearly ? "bg-ink text-ink-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {t(`period.${k}`)}
            {k === "yearly" ? (
              <span className="kashi-btn bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success [--cut:5px]">
                {t("period.save")}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
      {/* Phones: plans side by side to swipe, the recommended one first. */}
      <ul className="mt-10 flex snap-x snap-mandatory [scrollbar-width:none] gap-4 overflow-x-auto py-3 max-sm:-mx-4 max-sm:px-4 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:py-0 lg:grid-cols-4">
        {plans.map((p) => {
          const hot = p.code === highlight;
          const custom = p.priceMonthlyCents === 0 && p.code !== "free";
          return (
            <li
              key={p.id}
              className={cn(
                "relative flex w-[82%] shrink-0 snap-center flex-col rounded-3xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border transition-transform hover:-translate-y-1 sm:w-auto",
                hot && "max-sm:order-first",
                hot &&
                  "bg-[#1c1917] text-white shadow-[0_30px_70px_-30px_rgb(234_88_12/0.65)] ring-0 lg:-my-3 lg:py-9",
              )}
            >
              {hot ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-6 -top-px h-px bg-gradient-to-r from-transparent via-accent to-transparent"
                />
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">{name(p)}</h2>
                {hot ? (
                  <span className="kashi-btn bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-fg [--cut:5px]">
                    {t("popular")}
                  </span>
                ) : null}
              </div>
              {KNOWN.includes(p.code) ? (
                <p className={cn("mt-1 text-sm", hot ? "text-white/60" : "text-fg-muted")}>
                  {t(`plans.${p.code}.tagline`)}
                </p>
              ) : null}
              <p className="mt-4 min-h-[4.5rem]">
                {custom ? (
                  <span className="text-2xl font-bold">{t("onQuote")}</span>
                ) : p.priceMonthlyCents === 0 ? (
                  <span className="text-3xl font-bold">{t("free")}</span>
                ) : (
                  <>
                    {(() => {
                      // The figure big and on one line; its unit and "/ month" small beneath.
                      const full = money(
                        yearly ? Math.round((p.priceMonthlyCents * 10) / 12) : p.priceMonthlyCents,
                      );
                      const cut = full.lastIndexOf(" ");
                      return (
                        <>
                          <span className="block text-3xl leading-tight font-black whitespace-nowrap tabular-nums">
                            {cut > 0 ? full.slice(0, cut) : full}
                          </span>
                          <span className={cn("text-sm", hot ? "text-white/60" : "text-fg-muted")}>
                            {cut > 0 ? `${full.slice(cut + 1)} ` : ""}
                            {tb("perMonth")}
                          </span>
                        </>
                      );
                    })()}
                    {yearly ? (
                      <span className={cn("mt-1 block text-xs", hot ? "text-white/60" : "text-fg-muted")}>
                        {t("billedYearly", { amount: money(p.priceMonthlyCents * 10) })}
                      </span>
                    ) : null}
                  </>
                )}
              </p>
              <ul
                className={cn(
                  "mt-6 flex-1 space-y-2.5 border-t pt-6 text-sm",
                  hot ? "border-white/10" : "border-border",
                )}
              >
                {planFeatureLines(p.limits, tb).map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                        hot ? "bg-accent text-accent-fg" : "bg-success-soft text-success",
                      )}
                    >
                      <Check className="size-3" aria-hidden="true" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={custom ? "/#contact" : "/signup"}
                className={cn(buttonClasses(hot ? "accent" : "secondary", "lg"), "mt-7 w-full")}
              >
                {custom ? t("contact") : t("start")}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-8 text-center text-sm text-fg-muted">{t("yearly")}</p>
      <Compare plans={plans.map((p) => ({ ...p, label: name(p) }))} />
    </>
  );
}

/** Every plan side by side: limits, then what each one includes. */
async function Compare({
  plans,
}: {
  plans: {
    id: string;
    code: string;
    label: string;
    limits: Awaited<ReturnType<typeof listPublicPlans>>[number]["limits"];
  }[];
}) {
  const [t, tb, locale] = await Promise.all([
    getTranslations("pricing"),
    getTranslations("billing"),
    getLocale(),
  ]);
  const limit = (v: number | null) =>
    v === null ? t("compare.unlimited") : new Intl.NumberFormat(locale).format(v);
  const rows: { label: string; cell: (p: (typeof plans)[number]) => React.ReactNode }[] = [
    { label: t("compare.tables"), cell: (p) => limit(p.limits.maxTables) },
    { label: t("compare.staff"), cell: (p) => limit(p.limits.maxStaff) },
    { label: t("compare.venues"), cell: (p) => limit(p.limits.maxRestaurants) },
    { label: t("compare.orders"), cell: (p) => limit(p.limits.maxOrdersPerMonth) },
    ...["qr", "pos", "kitchen", "reports", "accounting"].map((k) => ({
      label: t(`compare.included.${k}`),
      cell: () => true as React.ReactNode,
    })),
    ...["online_payments", "invoices_email", "analytics_advanced", "custom_branding", "priority_support"].map(
      (f) => ({
        label: tb(`features.${f}`),
        cell: (p: (typeof plans)[number]) => p.limits.features.includes(f) as React.ReactNode,
      }),
    ),
  ];
  return (
    <section className="mt-20">
      <h2 className="text-center text-2xl font-black tracking-tight sm:text-3xl">{t("compare.title")}</h2>
      <p className="mx-auto mt-2 max-w-xl text-center text-fg-muted">{t("compare.subtitle")}</p>
      <div className="mt-8 overflow-x-auto rounded-3xl bg-surface shadow-[var(--shadow-soft)] ring-1 ring-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-4 text-start font-semibold text-fg-muted" />
              {plans.map((p) => (
                <th
                  key={p.id}
                  className={cn(
                    "px-4 py-4 text-center text-base font-bold",
                    p.code === "professional" && "text-accent-text",
                  )}
                >
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.label} className="hover:bg-surface-2/50">
                <td className="px-5 py-3 font-medium">{r.label}</td>
                {plans.map((p) => {
                  const v = r.cell(p);
                  return (
                    <td
                      key={p.id}
                      className={cn(
                        "px-4 py-3 text-center tabular-nums",
                        p.code === "professional" && "bg-accent-soft/30",
                      )}
                    >
                      {v === true ? (
                        <Check className="mx-auto size-5 text-success" aria-label={t("compare.yes")} />
                      ) : v === false ? (
                        <Minus className="mx-auto size-4 text-fg-subtle" aria-label={t("compare.no")} />
                      ) : (
                        <span className="font-semibold">{v}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** What owners ask before paying. */
async function Faq() {
  const t = await getTranslations("pricing.faq");
  const keys = ["trial", "change", "payment", "invoice", "cancel", "data"] as const;
  return (
    <section className="mx-auto mt-20 max-w-3xl">
      <h2 className="text-center text-2xl font-black tracking-tight sm:text-3xl">{t("title")}</h2>
      <div className="mt-8 space-y-3">
        {keys.map((k) => (
          <details
            key={k}
            className="group rounded-2xl bg-surface px-5 py-4 shadow-[var(--shadow-soft)] ring-1 ring-border open:ring-accent/40"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
              {t(`${k}.q`)}
              <ChevronDown className="size-5 shrink-0 text-fg-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-sm leading-7 text-fg-muted">{t(`${k}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

async function TrustStrip() {
  const t = await getTranslations("landing");
  const items = [
    { Icon: Smartphone, text: t("trust.noApp") },
    { Icon: CreditCard, text: t("trust.zarinpal") },
    { Icon: FileText, text: t("trust.invoice") },
  ];
  return (
    <ul className="mx-auto mt-12 grid max-w-3xl gap-3 sm:grid-cols-3">
      {items.map(({ Icon, text }) => (
        <li
          key={text}
          className="flex items-center gap-3 rounded-2xl bg-surface p-4 text-sm font-semibold shadow-[var(--shadow-soft)] ring-1 ring-border"
        >
          <span className="kashi-tile grid size-10 shrink-0 place-items-center bg-accent-soft text-accent-text">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          {text}
        </li>
      ))}
    </ul>
  );
}
