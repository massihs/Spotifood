import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarCheck, Clock, Ticket, Users } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { AutoRefresh, CancelBooking } from "@/components/reservations/public-ui";
import { PlaceHeader } from "@/components/reservations/place-header";
import { cn } from "@/lib/cn";
import { db } from "@/server/db/client";
import { getByCode } from "@/server/modules/reservations/service";

type Props = PageProps<"/[locale]/r/[slug]/b/[code]">;

/** A booking's status page is personal: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function StatusPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Status params={params} />
    </Suspense>
  );
}

async function Status({ params }: Pick<Props, "params">) {
  const { slug, code } = await params;
  const found = await getByCode(db, slug, code);
  if (!found) notFound();
  const { place, reservation: r, ahead } = found;
  const [t, format] = await Promise.all([getTranslations("booking"), getFormatter()]);
  const queue = r.kind === "queue";
  const live = ["pending", "confirmed", "notified"].includes(r.status);
  return (
    <div data-brand={place.brandColor}>
      <PlaceHeader
        name={place.name}
        logoKey={place.logoKey}
        title={queue ? t("yourTicket") : t("yourBooking")}
      />
      <main className="relative mx-auto -mt-8 max-w-md space-y-4 rounded-t-3xl bg-bg px-4 pt-6 pb-12">
        {queue && live ? <AutoRefresh seconds={20} /> : null}
        <div className="rounded-3xl border border-border bg-surface p-5 text-center shadow-[var(--shadow-float)]">
          {queue ? (
            <>
              <Ticket className="mx-auto size-8 text-accent" />
              <p className="mt-2 text-sm text-fg-muted">{t("ticketNumber")}</p>
              <p className="text-6xl font-black tabular-nums">{r.queueNumber}</p>
              {r.status === "notified" ? (
                <p className="mt-3 animate-pulse rounded-2xl bg-success-soft px-4 py-3 text-lg font-bold text-success">
                  {t("tableReady")}
                </p>
              ) : r.status === "confirmed" ? (
                <p className="mt-3 text-lg font-semibold">
                  {ahead === 0 ? t("youAreNext") : t("ahead", { count: ahead })}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <CalendarCheck className="mx-auto size-8 text-accent" />
              <p className="mt-2 text-2xl font-bold">
                {format.dateTime(r.startsAt, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: place.timezone,
                })}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-3xl font-black tabular-nums">
                <Clock className="size-6" />
                {format.dateTime(r.startsAt, { timeStyle: "short", timeZone: place.timezone })}
              </p>
            </>
          )}
          <p className="mt-3 inline-flex items-center gap-1 text-fg-muted">
            <Users className="size-4" />
            {t("forPeople", { count: r.partySize, name: r.name })}
          </p>
          <p
            className={cn(
              "mx-auto mt-4 w-fit rounded-full px-3 py-1 text-sm font-semibold",
              r.status === "cancelled" || r.status === "no_show"
                ? "bg-danger-soft text-danger"
                : r.status === "pending"
                  ? "bg-warning-soft text-warning"
                  : "bg-success-soft text-success",
            )}
          >
            {t(`status.${r.status}`)}
          </p>
        </div>
        {live ? <CancelBooking slug={slug} code={code} /> : null}
      </main>
    </div>
  );
}
