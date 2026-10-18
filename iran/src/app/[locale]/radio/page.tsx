import { Radio } from "lucide-react";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { RadioApp } from "@/components/music/radio-app";
import { LogoMark } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { listStations } from "@/server/modules/music/service";

export async function generateMetadata({ params }: PageProps<"/[locale]/radio">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "music.radio" });
  return { title: t("pageTitle") };
}

export default async function RadioPage({ params, searchParams }: PageProps<"/[locale]/radio">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="flex min-h-dvh flex-col bg-black text-white" data-brand="emerald">
      <header className="flex items-center gap-3 px-4 pt-3 pb-1">
        <Link
          href="/"
          aria-label="Spotifood"
          className="grid size-10 place-items-center rounded-full bg-[#1f1f1f]"
        >
          <LogoMark className="size-6" />
        </Link>
        <p className="inline-flex items-center gap-2 font-bold">
          <Radio className="size-5 text-[#1ed760]" aria-hidden="true" />
          Spotifood Radio
        </p>
        <div className="ms-auto">
          <LanguageSwitcher tone="inverted" />
        </div>
      </header>
      <Suspense fallback={<div className="m-2 h-[70dvh] animate-pulse rounded-lg bg-[#121212]" />}>
        <Stations searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Stations({ searchParams }: Pick<PageProps<"/[locale]/radio">, "searchParams">) {
  const [t, stations, sp] = await Promise.all([
    getTranslations("music.radio"),
    listStations(db),
    searchParams,
  ]);
  if (!stations.length)
    return (
      <p className="m-2 rounded-lg bg-[#121212] px-6 py-24 text-center text-white/70">{t("noStations")}</p>
    );
  const current = stations.find((s) => s.slug === sp.s) ?? stations[0]!;
  return (
    <RadioApp stations={stations.map(({ id: _id, createdAt: _c, ...s }) => s)} initialSlug={current.slug} />
  );
}
