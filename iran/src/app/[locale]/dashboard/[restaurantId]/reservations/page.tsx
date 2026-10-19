import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { LiveRefresh } from "@/components/realtime/live";
import {
  BookingList,
  NewBookingButton,
  QueueBoard,
  ReservationSettings,
} from "@/components/reservations/reservations-ui";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { localDay } from "@/lib/period";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { getReservationSettings, listDay } from "@/server/modules/reservations/service";
import { can } from "@/server/tenancy";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/reservations">;
const TABS = ["bookings", "queue", "settings"] as const;

export default function ReservationsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <Reservations params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const shift = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function Reservations({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "orders.view");
  const sp = await searchParams;
  const tz = ctx.restaurant.timezone;
  const tab = (TABS as readonly string[]).includes(String(sp.tab))
    ? (sp.tab as (typeof TABS)[number])
    : "bookings";
  const today = localDay(new Date(), tz);
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const [t, format, locale, data, settings] = await Promise.all([
    getTranslations("reservations"),
    getFormatter(),
    getLocale(),
    listDay(db, ctx, tab === "queue" ? today : day),
    getReservationSettings(db, ctx),
  ]);
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/reservations`;
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const rows = (list: typeof data.bookings) =>
    list.map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), notifiedAt: iso(r.notifiedAt) }));
  const active = data.bookings.filter((b) => !["cancelled", "no_show"].includes(b.status));
  const waiting = data.queue.filter((q) => q.status === "confirmed" || q.status === "notified").length;
  const prefix = locale === "fa" ? "" : `/${locale}`;
  const appUrl = env().APP_URL;

  return (
    <>
      <LiveRefresh types={["notification.created"]} />
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={tab === "bookings" ? <NewBookingButton rid={rid} day={day} /> : null}
      />
      <nav
        className="-mx-4 mb-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4"
        aria-label={t("title")}
      >
        {TABS.filter((k) => k !== "settings" || can(ctx, "restaurant.manage")).map((k) => (
          <Link
            key={k}
            href={k === "bookings" ? base : `${base}?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap",
              tab === k ? "bg-accent text-accent-fg" : "bg-surface text-fg-muted ring-1 ring-border",
            )}
          >
            {t(`tabs.${k}`)}
            {k === "queue" && waiting ? (
              <span className="ms-2 inline-grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-xs font-bold text-white tabular-nums">
                {waiting}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === "bookings" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Link
              href={`${base}?day=${shift(day, -1)}`}
              className="grid size-10 place-items-center rounded-full ring-1 ring-border"
              aria-label={t("prevDay")}
            >
              <ChevronRight className="size-5 ltr:rotate-180" />
            </Link>
            <p className="min-w-44 text-center font-semibold">
              {format.dateTime(new Date(`${day}T12:00:00Z`), {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "UTC",
              })}
            </p>
            <Link
              href={`${base}?day=${shift(day, 1)}`}
              className="grid size-10 place-items-center rounded-full ring-1 ring-border"
              aria-label={t("nextDay")}
            >
              <ChevronLeft className="size-5 ltr:rotate-180" />
            </Link>
            {day !== today ? (
              <Link href={base} className="rounded-full px-3 py-1.5 text-sm ring-1 ring-border">
                {t("today")}
              </Link>
            ) : null}
            <div className="ms-auto flex gap-2">
              {[
                [t("statBookings"), active.length],
                [t("statCovers"), active.reduce((s, b) => s + b.partySize, 0)],
                [t("statNoShow"), data.bookings.filter((b) => b.status === "no_show").length],
              ].map(([k, v]) => (
                <span
                  key={String(k)}
                  className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm"
                >
                  {k}: <b className="tabular-nums">{v}</b>
                </span>
              ))}
            </div>
          </div>
          <BookingList rid={rid} rows={rows(data.bookings)} timeZone={tz} locale={locale} />
        </>
      ) : null}
      {tab === "queue" ? <QueueBoard rid={rid} rows={rows(data.queue)} /> : null}
      {tab === "settings" ? (
        <ReservationSettings
          rid={rid}
          initial={settings}
          links={{
            book: `${appUrl}${prefix}/r/${settings.slug}/book`,
            queue: `${appUrl}${prefix}/r/${settings.slug}/queue`,
          }}
        />
      ) : null}
    </>
  );
}
