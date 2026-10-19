import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { AutoPrint } from "@/components/kitchen/auto-print";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getTicket } from "@/server/modules/kitchen/stations";

type Props = PageProps<"/[locale]/print/kitchen/[restaurantId]/[orderId]">;

/** 80 mm kitchen ticket (thermal printer). `?station=` keeps that station's items; `?auto=1` prints. */
export default function TicketPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={null}>
      <Ticket params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Ticket({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId, orderId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "orders.view");
  const station = typeof sp.station === "string" ? sp.station : null;
  const [t, format, ticket] = await Promise.all([
    getTranslations("kitchen.ticket"),
    getFormatter(),
    getTicket(db, ctx, orderId, station),
  ]);
  const { order: o, items } = ticket;
  return (
    <div className="mx-auto w-[72mm] bg-white p-2 font-sans text-[13px] leading-snug text-black">
      <style>{`@page { size: 80mm auto; margin: 4mm; } @media print { body { background: white } }`}</style>
      <div className="border-b-2 border-dashed border-black pb-2 text-center">
        <p className="text-sm font-bold">{ctx.restaurant.name}</p>
        {ticket.station ? <p className="text-xs">{ticket.station.name}</p> : null}
        <p className="mt-1 text-3xl font-black tabular-nums">{o.number}</p>
        <p className="text-base font-bold">
          {o.channel === "delivery"
            ? t("delivery")
            : o.channel === "takeaway"
              ? t("takeaway")
              : t("table", { table: o.tableLabel ?? "—" })}
        </p>
        <p className="text-xs">
          {format.dateTime(o.placedAt, {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: ctx.restaurant.timezone,
          })}
        </p>
      </div>
      <ul className="divide-y divide-dashed divide-black/40">
        {items.map((i) => (
          <li key={i.id} className="py-1.5">
            <p className="flex gap-2 text-base font-bold">
              <span className="tabular-nums">{i.quantity}×</span>
              <span>{i.productName}</span>
            </p>
            {i.options.length ? (
              <p className="ps-6 text-xs">{i.options.map((x) => x.valueName).join("، ")}</p>
            ) : null}
            {i.note ? <p className="ps-6 text-xs font-bold">« {i.note} »</p> : null}
          </li>
        ))}
        {!items.length ? <li className="py-3 text-center text-xs">{t("nothing")}</li> : null}
      </ul>
      {o.note ? (
        <p className="mt-1 border-t-2 border-dashed border-black pt-1 text-sm font-bold">
          {t("note", { note: o.note })}
        </p>
      ) : null}
      {o.channel === "delivery" && o.deliveryAddress ? (
        <p className="mt-1 border-t-2 border-dashed border-black pt-1 text-xs">
          {o.deliveryAddress}
          {o.customerPhone ? ` · ${o.customerPhone}` : ""}
        </p>
      ) : null}
      <AutoPrint enabled={sp.auto === "1" && items.length > 0} />
    </div>
  );
}
