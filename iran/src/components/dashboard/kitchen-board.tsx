"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { LiveIndicator, LiveRefresh, useLiveEvent } from "@/components/realtime/live";
import { Toast } from "@/components/ui/toast";
import { OrderCard, type OrderCardData } from "./order-card";

const COLUMNS = ["received", "accepted", "preparing", "ready", "served"] as const;

const DOT: Record<(typeof COLUMNS)[number], string> = {
  received: "bg-accent",
  accepted: "bg-warning",
  preparing: "bg-warning",
  ready: "bg-success",
  served: "bg-fg-subtle",
};

/** Two short tones; browsers only allow audio after a user gesture, hence the toggle. */
function chime(ctx: AudioContext) {
  const now = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.17);
  });
}

export function KitchenBoard({
  restaurantId,
  orders,
  timeZone,
  canUpdate,
  canCancel,
}: {
  restaurantId: string;
  orders: OrderCardData[];
  timeZone: string;
  canUpdate: boolean;
  canCancel: boolean;
}) {
  const t = useTranslations("kitchen");
  const audio = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useLiveEvent((type, data) => {
    if (type !== "order.created") return;
    setToast(t("newOrder", { number: String(data.number ?? "") }));
    if (sound && audio.current) chime(audio.current);
  });

  useEffect(() => () => void audio.current?.close(), []);

  const byStatus = (s: (typeof COLUMNS)[number]) =>
    orders.filter((o) =>
      s === "received" ? o.status === "received" || o.status === "pending_payment" : o.status === s,
    );

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col">
      <LiveRefresh types={["order.created", "order.updated"]} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t("title")}</h1>
          <LiveIndicator />
        </div>
        <div className="flex gap-2">
          <Button
            variant={sound ? "primary" : "secondary"}
            size="sm"
            aria-pressed={sound}
            onClick={() => {
              if (!audio.current) audio.current = new AudioContext();
              void audio.current.resume();
              if (!sound) chime(audio.current);
              setSound(!sound);
            }}
          >
            {sound ? (
              <Bell className="size-4" aria-hidden="true" />
            ) : (
              <BellOff className="size-4" aria-hidden="true" />
            )}
            {sound ? t("soundOn") : t("soundOff")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="max-sm:hidden"
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
          >
            <Maximize2 className="size-4" aria-hidden="true" />
            {t("fullscreen")}
          </Button>
        </div>
      </div>
      <div className="-mx-4 grid min-h-0 flex-1 snap-x snap-mandatory scroll-px-4 auto-cols-[min(20rem,85vw)] grid-flow-col gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:auto-cols-[minmax(17rem,1fr)] sm:px-0">
        {COLUMNS.map((col) => {
          const list = byStatus(col);
          return (
            <section
              key={col}
              aria-labelledby={`col-${col}`}
              className="flex min-h-0 snap-start flex-col rounded-3xl bg-surface-2/70 p-2"
            >
              <h2
                id={`col-${col}`}
                className="flex items-center justify-between px-2.5 py-2 text-sm font-extrabold"
              >
                <span className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", DOT[col])} aria-hidden="true" />
                  {t(`columns.${col}`)}
                </span>
                <span
                  className={cn(
                    "grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-black tabular-nums",
                    list.length ? "bg-ink text-ink-fg" : "bg-surface text-fg-subtle",
                  )}
                >
                  {list.length}
                </span>
              </h2>
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-0.5">
                {list.map((o) => (
                  <li key={o.id}>
                    <OrderCard
                      restaurantId={restaurantId}
                      order={o}
                      canUpdate={canUpdate}
                      canCancel={canCancel}
                      timeZone={timeZone}
                      compact
                    />
                  </li>
                ))}
                {list.length === 0 ? (
                  <li className="mx-1 rounded-2xl border-2 border-dashed border-border py-8 text-center text-sm text-fg-subtle">
                    {t("empty")}
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
      <Toast message={toast} onDone={() => setToast(null)} duration={4000} />
    </div>
  );
}
