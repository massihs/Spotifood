"use client";

import { useTranslations } from "next-intl";
import {
  AArrowDown,
  AArrowUp,
  ChefHat,
  ListChecks,
  Maximize2,
  Minimize2,
  Moon,
  Printer,
  Settings2,
  Sun,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTicks } from "@/lib/kds-ticks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { usePref, writePref } from "@/components/ui/use-pref";
import { LiveIndicator, LiveRefresh, useLiveEvent } from "@/components/realtime/live";
import { StationManager, STATION_TONE, type StationView } from "@/components/kitchen/stations";
import { AcceptAllButton } from "./accept-all-button";
import { OrderCard, type OrderCardData } from "./order-card";
import { stationProgress, stationState } from "@/lib/station-state";

/**
 * What the kitchen works with: to start, cooking, ready to go out. Served orders leave the screen
 * (the orders page keeps them); new guest orders show only when the till does not accept them.
 */
const KITCHEN_COLUMNS = ["received", "accepted", "preparing", "ready"] as const;
type Column = (typeof KITCHEN_COLUMNS)[number] | "served";

const DOT: Record<Column, string> = {
  received: "bg-accent",
  accepted: "bg-warning",
  preparing: "bg-warning",
  ready: "bg-success",
  served: "bg-fg-subtle",
};

/** Per-device preferences: which station this screen shows, and whether it auto-prints tickets. */
export function KitchenBoard({
  restaurantId,
  orders,
  timeZone,
  canUpdate,
  canCancel,
  stations,
  categories,
  canManage,
  acceptAtTill,
  defaultStation,
  fallbackStationId,
}: {
  /** Guest orders reach this screen only once the till accepted them. */
  acceptAtTill: boolean;
  /** Station of the bar / kitchen member signed in (their screen opens on it). */
  defaultStation: string | null;
  /** The station that takes the dishes of categories no station prepares. */
  fallbackStationId: string | null;
  restaurantId: string;
  orders: OrderCardData[];
  timeZone: string;
  canUpdate: boolean;
  canCancel: boolean;
  stations: StationView[];
  categories: { id: string; name: string; stationId: string | null }[];
  canManage: boolean;
}) {
  const t = useTranslations("kitchen");
  const stationKey = `sf-kitchen-station-${restaurantId}`;
  const printKey = `sf-kitchen-autoprint-${restaurantId}`;
  const stored = usePref(stationKey, defaultStation ?? "all");
  const station = stored === "all" || stations.some((s) => s.id === stored) ? stored : "all";
  const autoPrint = usePref(printKey, "off") === "on";
  const darkKey = `sf-kitchen-dark-${restaurantId}`;
  const dark = usePref(darkKey, "off") === "on";
  const focusKey = `sf-kitchen-focus-${restaurantId}`;
  const focus = usePref(focusKey, "off") === "on";
  const bigKey = `sf-kitchen-big-${restaurantId}`;
  const big = usePref(bigKey, "off") === "on";
  const summaryKey = `sf-kitchen-summary-${restaurantId}`;
  const showSummary = usePref(summaryKey, "on") === "on";
  const { ticked } = useTicks();
  const board = useRef<HTMLDivElement>(null);
  const [managing, setManaging] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  const columns = acceptAtTill ? KITCHEN_COLUMNS.filter((c) => c !== "received") : KITCHEN_COLUMNS;
  const current = station === "all" ? null : (stations.find((s) => s.id === station) ?? null);
  const visible = orders
    .filter((o) => !acceptAtTill || (o.status !== "received" && o.status !== "pending_payment"))
    .map((o) => ({
      ...o,
      // Each station's part, for the chips (from all the lines of the order).
      progress: stationProgress(o.items, stations),
      items: current ? o.items.filter((i) => i.stationId === current.id) : o.items,
    }))
    .filter((o) => o.items.length > 0);

  /**
   * The column of an order on this screen: the order's status on "All"; on a station, where that
   * station's part stands (the bar's drinks can be ready while the kitchen cooks).
   */
  const columnOf = (o: (typeof visible)[number]): Column | "pending_payment" => {
    if (!current || o.status === "ready" || o.status === "served" || o.status === "pending_payment")
      return o.status as Column;
    const st = stationState(o.items);
    if (st === "ready") return "ready";
    if (st === "preparing") return "preparing";
    return o.status === "received" ? "received" : "accepted";
  };

  const ticketUrl = (orderId: string, auto = false) =>
    `/print/kitchen/${restaurantId}/${orderId}?${station === "all" ? "" : `station=${station}&`}${auto ? "auto=1" : ""}`;

  // Order sent to the kitchen + auto print on this screen: print its ticket in a hidden frame.
  useLiveEvent((type, data) => {
    if (type !== "order.accepted" || !autoPrint || !data.orderId || !frame.current) return;
    frame.current.src = ticketUrl(String(data.orderId), true);
  });

  const byStatus = (s: Column) =>
    visible.filter((o) => {
      const c = columnOf(o);
      return s === "received" ? c === "received" || c === "pending_payment" : c === s;
    });

  // "To cook": every dish still to make on this screen, added up (four koobideh at once, not one
  // ticket at a time). Lines already ticked off or marked ready by their station are left out.
  const toCook = new Map<string, number>();
  for (const o of visible) {
    const col = columnOf(o);
    if (col !== "received" && col !== "accepted" && col !== "preparing") continue;
    for (const i of o.items)
      if (!i.readyAt && !ticked.has(i.id))
        toCook.set(i.productName, (toCook.get(i.productName) ?? 0) + i.quantity);
  }
  const summary = [...toCook.entries()].sort((a, b) => b[1] - a[1]);

  const toggleFocus = () => {
    writePref(focusKey, focus ? "off" : "on");
    // Where the browser allows it, the real full screen too (not on iPhone / iPad: the overlay
    // alone covers the dashboard there).
    if (!focus) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };

  return (
    <div
      ref={board}
      className={cn(
        "flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col rounded-3xl transition-colors",
        // Kitchen mode: the board covers the whole screen, the dashboard's menus out of the way.
        focus && "fixed inset-0 z-50 h-dvh min-h-0 rounded-none bg-bg p-3 sm:p-4",
        dark && "kds-dark",
        dark && !focus && "-mx-2 p-3 sm:-mx-4 sm:p-4",
      )}
    >
      <LiveRefresh types={["order.created", "order.accepted", "order.updated"]} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {focus ? (
            <span className="grid size-10 place-items-center rounded-2xl bg-accent text-accent-fg">
              <ChefHat className="size-5" aria-hidden="true" />
            </span>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <LiveIndicator />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={showSummary}
            onClick={() => writePref(summaryKey, showSummary ? "off" : "on")}
            className={cn(showSummary && "ring-2 ring-accent")}
          >
            <ListChecks className="size-4" aria-hidden="true" />
            {t("summary")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={big}
            onClick={() => writePref(bigKey, big ? "off" : "on")}
            title={big ? t("textSmaller") : t("textBigger")}
            aria-label={big ? t("textSmaller") : t("textBigger")}
          >
            {big ? (
              <AArrowDown className="size-4" aria-hidden="true" />
            ) : (
              <AArrowUp className="size-4" aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={autoPrint}
            onClick={() => writePref(printKey, autoPrint ? "off" : "on")}
            className={cn(autoPrint && "ring-2 ring-accent")}
          >
            <Printer className="size-4" aria-hidden="true" />
            {autoPrint ? t("autoPrintOn") : t("autoPrintOff")}
          </Button>
          {canManage ? (
            <Button variant="secondary" size="sm" onClick={() => setManaging(true)}>
              <Settings2 className="size-4" aria-hidden="true" />
              {t("stations.manage")}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={dark}
            onClick={() => writePref(darkKey, dark ? "off" : "on")}
            className={cn(dark && "ring-2 ring-accent")}
          >
            {dark ? (
              <Sun className="size-4" aria-hidden="true" />
            ) : (
              <Moon className="size-4" aria-hidden="true" />
            )}
            {dark ? t("lightMode") : t("darkMode")}
          </Button>
          <Button
            variant={focus ? "primary" : "secondary"}
            size="sm"
            aria-pressed={focus}
            onClick={toggleFocus}
          >
            {focus ? (
              <Minimize2 className="size-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="size-4" aria-hidden="true" />
            )}
            {focus ? t("focusOff") : t("focusOn")}
          </Button>
        </div>
      </div>
      {stations.length ? (
        <div className="-mx-4 mb-3 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {[{ id: "all", name: t("stations.all"), color: "" } as StationView, ...stations].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => writePref(stationKey, s.id)}
              aria-pressed={station === s.id}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap",
                station === s.id ? "bg-fg text-bg" : "bg-surface text-fg-muted ring-1 ring-border",
              )}
            >
              {s.id !== "all" ? (
                <span
                  className={cn("size-2.5 rounded-full", STATION_TONE[s.color]?.dot)}
                  aria-hidden="true"
                />
              ) : null}
              {s.name}
              <span className="text-xs tabular-nums opacity-70">
                {s.id === "all"
                  ? orders.filter((o) => o.status !== "served").length
                  : orders.filter((o) => o.status !== "served" && o.items.some((i) => i.stationId === s.id))
                      .length}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {showSummary ? (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-surface p-2 ring-1 ring-border">
          <span className="flex shrink-0 items-center gap-1.5 ps-2 pe-1 text-sm font-bold text-fg-muted">
            <ListChecks className="size-4" aria-hidden="true" />
            {t("toCook")}
          </span>
          <ul className="flex min-w-0 flex-1 [scrollbar-width:none] gap-1.5 overflow-x-auto">
            {summary.length ? (
              summary.map(([name, n]) => (
                <li
                  key={name}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 py-1 ps-1 pe-3 text-sm font-semibold whitespace-nowrap"
                >
                  <span className="grid h-7 min-w-7 place-items-center rounded-full bg-fg px-1.5 text-sm font-black text-bg tabular-nums">
                    {n}
                  </span>
                  {name}
                </li>
              ))
            ) : (
              <li className="px-2 py-1.5 text-sm text-fg-subtle">{t("toCookEmpty")}</li>
            )}
          </ul>
        </div>
      ) : null}
      <div
        style={big ? { zoom: 1.2 } : undefined}
        className="-mx-4 grid min-h-0 flex-1 snap-x snap-mandatory scroll-px-4 auto-cols-[min(20rem,85vw)] grid-flow-col gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:auto-cols-[minmax(17rem,1fr)] sm:px-0"
      >
        {columns.map((col) => {
          const list = byStatus(col);
          return (
            <section
              key={col}
              aria-labelledby={`col-${col}`}
              className="flex min-h-0 snap-start flex-col rounded-2xl bg-surface-2/70 p-2"
            >
              <h2
                id={`col-${col}`}
                className="flex items-center justify-between px-2.5 py-2 text-sm font-semibold"
              >
                <span className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", DOT[col])} aria-hidden="true" />
                  {t(col === "accepted" ? "columns.queue" : `columns.${col}`)}
                </span>
                <span className="flex items-center gap-2">
                  {canUpdate && (col === "received" || col === "accepted") && list.length > 1 ? (
                    <AcceptAllButton
                      restaurantId={restaurantId}
                      from={col}
                      orderIds={list.filter((o) => o.status === col).map((o) => o.id)}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold tabular-nums",
                      list.length ? "bg-accent text-accent-fg" : "bg-surface text-fg-subtle",
                    )}
                  >
                    {list.length}
                  </span>
                </span>
              </h2>
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-0.5">
                {list.map((o) => (
                  <li key={o.id} className="relative">
                    {o.channel && o.channel !== "dine_in" ? (
                      <span
                        className={cn(
                          "absolute start-3 -top-1 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold text-white",
                          o.channel === "delivery" ? "bg-tone-sky" : "bg-tone-amber",
                        )}
                      >
                        {t(`channel.${o.channel}`)}
                      </span>
                    ) : null}
                    <OrderCard
                      restaurantId={restaurantId}
                      order={o}
                      canUpdate={canUpdate}
                      canCancel={canCancel}
                      timeZone={timeZone}
                      compact
                      station={current}
                      progress={o.progress}
                    />
                    <a
                      href={ticketUrl(o.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="ms-auto mt-1 flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs text-fg-subtle hover:bg-surface hover:text-fg"
                      aria-label={t("printTicket")}
                      title={t("printTicket")}
                    >
                      <Printer className="size-3.5" aria-hidden="true" />
                      {t("printTicket")}
                    </a>
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
      <iframe ref={frame} title="print" className="hidden" aria-hidden="true" />
      {managing ? (
        <StationManager
          restaurantId={restaurantId}
          stations={stations}
          categories={categories}
          fallbackStationId={fallbackStationId}
          onClose={() => setManaging(false)}
        />
      ) : null}
    </div>
  );
}
