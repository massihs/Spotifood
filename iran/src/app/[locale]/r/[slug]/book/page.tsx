import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { BookingForm } from "@/components/reservations/public-ui";
import { PlaceHeader } from "@/components/reservations/place-header";
import { localDay } from "@/lib/period";
import { db } from "@/server/db/client";
import { placeBySlug } from "@/server/modules/reservations/service";

type Props = PageProps<"/[locale]/r/[slug]/book">;

export default function BookPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Book params={params} />
    </Suspense>
  );
}

async function Book({ params }: Pick<Props, "params">) {
  const { slug } = await params;
  const place = await placeBySlug(db, slug);
  if (!place?.enabled) notFound();
  const [t, locale] = await Promise.all([getTranslations("booking"), getLocale()]);
  const today = localDay(new Date(), place.timezone);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000);
    return {
      key: d.toISOString().slice(0, 10),
      weekday:
        i === 0
          ? t("todayShort")
          : new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(d),
      label: new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }).format(d),
    };
  });
  return (
    <div data-brand={place.brandColor}>
      <PlaceHeader name={place.name} logoKey={place.logoKey} title={t("bookTitle")} />
      <main className="relative mx-auto -mt-8 max-w-md rounded-t-3xl bg-bg px-4 pt-6 pb-12">
        <BookingForm slug={slug} days={days} maxParty={place.maxParty} />
      </main>
    </div>
  );
}
