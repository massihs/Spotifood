"use client";

import { CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import { useMoney } from "@/components/ui/use-money";
import { cn } from "@/lib/cn";
import { displayChannel, type DisplayState } from "@/lib/customer-display";

type Labels = Record<
  "welcome" | "total" | "discount" | "toPay" | "card" | "thanks" | "change" | "order",
  string
>;

/** Big, calm screen facing the customer; follows the till through a browser channel. */
export function CustomerDisplay({
  restaurantId,
  name,
  logo,
  brand,
  currency,
  labels,
}: {
  restaurantId: string;
  name: string;
  logo: string | null;
  brand: string;
  currency: string;
  labels: Labels;
}) {
  const money = useMoney(currency);
  const [s, setS] = useState<DisplayState>({ status: "idle", lines: [], discountCents: 0, totalCents: 0 });
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(displayChannel(restaurantId));
    ch.onmessage = (e) => {
      if (e.data && typeof e.data === "object") setS(e.data as DisplayState);
    };
    ch.postMessage("hello");
    return () => ch.close();
  }, [restaurantId]);
  // Back to the welcome screen a while after a paid sale.
  useEffect(() => {
    if (s.status !== "paid") return;
    const id = window.setTimeout(
      () => setS((x) => (x.status === "paid" ? { ...x, status: "idle" } : x)),
      12_000,
    );
    return () => window.clearTimeout(id);
  }, [s.status]);

  const brandBlock = (
    <div className="flex items-center gap-4">
      {logo ? <img src={logo} alt="" className="size-16 rounded-2xl bg-white object-contain p-1" /> : null}
      <p className="text-3xl font-extrabold tracking-tight">{name}</p>
    </div>
  );

  return (
    <div data-brand={brand} className="flex min-h-dvh flex-col bg-bg text-fg">
      {s.status === "idle" || (s.status === "paid" && !s.lines.length && s.changeCents == null) ? (
        <div className="grid flex-1 place-items-center p-10 text-center">
          <div className="space-y-6">
            <div className="flex justify-center">{brandBlock}</div>
            <p className="text-2xl text-fg-muted">{labels.welcome}</p>
          </div>
        </div>
      ) : s.status === "paid" ? (
        <div className="grid flex-1 place-items-center p-10 text-center">
          <div className="space-y-5">
            <p className="text-6xl font-black text-accent-text">{labels.thanks}</p>
            {s.number ? <p className="text-3xl font-bold">{`${labels.order} ${s.number}`}</p> : null}
            {s.changeCents ? (
              <p className="text-3xl">
                {labels.change} <b className="tabular-nums">{money(s.changeCents)}</b>
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid flex-1 gap-6 p-8 lg:grid-cols-[1fr_28rem] lg:p-12">
          <div className="flex min-h-0 flex-col">
            {brandBlock}
            <ul className="mt-8 flex-1 divide-y divide-border overflow-y-auto text-2xl">
              {s.lines.map((l, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4 py-3">
                  <span className="min-w-0 truncate">
                    <b className="tabular-nums">{l.quantity}×</b> {l.name}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{money(l.totalCents)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div
            className={cn(
              "flex flex-col justify-center rounded-[2rem] p-10 text-center",
              s.status === "card" ? "bg-tone-indigo text-white" : "bg-accent text-accent-fg",
            )}
          >
            {s.status === "card" ? (
              <CreditCard className="mx-auto mb-4 size-14 animate-pulse" aria-hidden="true" />
            ) : null}
            <p className="text-2xl font-semibold opacity-85">
              {s.status === "card" ? labels.card : s.status === "paying" ? labels.toPay : labels.total}
            </p>
            <p className="mt-3 text-6xl font-black tabular-nums">{money(s.totalCents)}</p>
            {s.discountCents ? (
              <p className="mt-4 text-xl opacity-85">
                {labels.discount} −{money(s.discountCents)}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
