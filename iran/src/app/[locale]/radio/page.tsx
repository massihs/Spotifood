import { Music, Radio } from "lucide-react";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { RadioPlayer } from "@/components/music/players";
import { Logo } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
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
    <div className="min-h-dvh bg-[#0b1220] text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Spotifood" className="rounded-xl bg-white px-3 py-1.5">
          <Logo />
        </Link>
        <LanguageSwitcher tone="inverted" />
      </header>
      <Suspense fallback={<div className="mx-auto h-96 max-w-5xl animate-pulse rounded-3xl bg-white/5" />}>
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
  const current = stations.find((s) => s.slug === sp.s) ?? stations[0];
  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
      <div className="mb-8">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
          <Radio className="size-3.5" aria-hidden="true" />
          Spotifood Radio
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{t("heading")}</h1>
        <p className="mt-2 max-w-xl text-white/70">{t("intro")}</p>
      </div>
      {!current ? (
        <p className="rounded-3xl bg-white/5 px-6 py-16 text-center text-white/70">{t("noStations")}</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <RadioPlayer key={current.slug} slug={current.slug} name={current.name} color={current.color} />
          <nav aria-label={t("stations")} className="space-y-2">
            <p className="mb-1 text-sm font-semibold text-white/60">{t("stations")}</p>
            {stations.map((s) => (
              <Link
                key={s.slug}
                href={`/radio?s=${s.slug}`}
                scroll={false}
                aria-current={s.slug === current.slug ? "true" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl p-3 transition-colors",
                  s.slug === current.slug ? "bg-white/15" : "bg-white/5 hover:bg-white/10",
                )}
              >
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-xl"
                  style={{ background: `linear-gradient(135deg, ${s.color}, #0b1220)` }}
                >
                  <Music className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.name}</span>
                  {s.description ? (
                    <span className="block truncate text-xs text-white/60">{s.description}</span>
                  ) : null}
                </span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </main>
  );
}
