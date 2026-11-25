import { BookOpen, ChevronLeft, Search, Store, Utensils } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { listHelp, searchHelp } from "@/server/modules/support/help";

type Props = PageProps<"/[locale]/help">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "support" });
  return { title: t("helpCenter"), description: t("helpCenterSubtitle") };
}

export default async function HelpPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("support");
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-accent-fg shadow-accent">
            <BookOpen className="size-7" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{t("helpCenter")}</h1>
          <p className="mt-2 text-fg-muted">{t("helpCenterSubtitle")}</p>
        </div>
        <Suspense fallback={<div className="mt-8 h-60 animate-pulse rounded-3xl bg-surface-2" />}>
          <Articles searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

async function Articles({ searchParams }: Pick<Props, "searchParams">) {
  await connection();
  const [t, locale, sp] = await Promise.all([getTranslations("support"), getLocale(), searchParams]);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 200) : "";
  const [results, all] = await Promise.all([
    q ? searchHelp(db, locale, q, "any") : Promise.resolve(null),
    listHelp(db, locale, "any"),
  ]);
  const group = (audience: string) => all.filter((a) => a.audience === audience || a.audience === "all");
  const list = (items: { slug: string; title: string }[]) => (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border/80 bg-surface shadow-[var(--shadow-soft)]">
      {items.map((a) => (
        <li key={a.slug}>
          <Link
            href={`/help/${a.slug}`}
            className="flex items-center gap-3 px-5 py-4 font-semibold transition-colors hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">{a.title}</span>
            <ChevronLeft className="size-4 shrink-0 text-fg-subtle ltr:rotate-180" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <form className="relative mt-8" role="search">
        <Search
          className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t("searchHelp")}
          aria-label={t("searchHelp")}
          className="h-14 w-full rounded-full border border-border bg-surface ps-12 pe-5 text-base shadow-[var(--shadow-soft)] outline-none focus:border-accent focus:ring-4 focus:ring-[var(--ring)]"
        />
      </form>
      {results ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-extrabold">{t("resultsFor", { q })}</h2>
          {results.length ? (
            list(results)
          ) : (
            <p className="rounded-3xl bg-surface-2 p-5 text-fg-muted">{t("noResults")}</p>
          )}
        </section>
      ) : null}
      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
          <Utensils className="size-5 text-accent-text" aria-hidden="true" />
          {t("forGuests")}
        </h2>
        {list(group("guest"))}
      </section>
      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
          <Store className="size-5 text-accent-text" aria-hidden="true" />
          {t("forRestaurants")}
        </h2>
        {list(group("restaurant"))}
        <p className="mt-3 text-sm text-fg-muted">{t("restaurantsChatHint")}</p>
      </section>
    </>
  );
}
