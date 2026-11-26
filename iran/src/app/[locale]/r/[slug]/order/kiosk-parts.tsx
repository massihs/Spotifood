"use client";

import { Check, CreditCard, RotateCcw, ShoppingBag, Store, UtensilsCrossed } from "@/components/icons";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { QuantityStepper } from "@/components/guest/parts";
import { Amount } from "@/components/ui/amount";
import { PlaceInitials } from "@/components/ui/place-initials";
import { cn } from "@/lib/cn";
import type { PublicProduct } from "@/server/modules/menu/public";

/**
 * The counter kiosk's own screens around the shared menu: the welcome screen (eat in or take
 * away), the order panel always in view on a landscape tablet, and the big number at the end.
 */

export type KioskBrand = { name: string; logo: string | null };
export type KioskChannel = "dine_in" | "takeaway";

function Logo({ brand, className }: { brand: KioskBrand; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-white", className)}>
      {brand.logo ? (
        <img src={brand.logo} alt="" className="size-full object-contain p-1.5" />
      ) : (
        <PlaceInitials name={brand.name} />
      )}
    </span>
  );
}

/** Slim top bar of the kiosk menu: who we order from, and where we eat. */
export function KioskTopBar({
  brand,
  channel,
  onChannel,
}: {
  brand: KioskBrand;
  channel: KioskChannel;
  onChannel: (c: KioskChannel) => void;
}) {
  const t = useTranslations("online");
  return (
    <div className="flex items-center gap-3 px-4 pt-4 sm:px-6">
      <Logo
        brand={brand}
        className="size-12 rounded-2xl text-xl shadow-[var(--shadow-soft)] ring-1 ring-border"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xl font-black tracking-tight">{brand.name}</p>
        <p className="text-sm text-fg-muted">{t("kioskTitle")}</p>
      </div>
      <ChannelSwitch channel={channel} onChannel={onChannel} className="lg:hidden" />
    </div>
  );
}

function ChannelSwitch({
  channel,
  onChannel,
  className,
}: {
  channel: KioskChannel;
  onChannel: (c: KioskChannel) => void;
  className?: string;
}) {
  const t = useTranslations("online");
  return (
    <div className={cn("grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1", className)} role="tablist">
      {(
        [
          ["dine_in", UtensilsCrossed, t("kioskEatIn")],
          ["takeaway", Store, t("kioskTakeAway")],
        ] as const
      ).map(([id, Icon, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={channel === id}
          onClick={() => onChannel(id)}
          className={cn(
            "kashi-btn flex h-10 items-center justify-center gap-1.5 px-3.5 text-sm font-bold whitespace-nowrap transition-colors",
            channel === id ? "bg-surface text-fg shadow-[var(--shadow-soft)]" : "text-fg-muted",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** First screen: the brand, and two big doors — eat in, take away. */
export function KioskWelcome({ brand, onStart }: { brand: KioskBrand; onStart: (c: KioskChannel) => void }) {
  const t = useTranslations("online");
  const door = (c: KioskChannel, Icon: typeof Store, label: string) => (
    <button
      type="button"
      onClick={() => onStart(c)}
      className="group flex aspect-[4/3] flex-col items-center justify-center gap-5 rounded-[2rem] bg-white/95 p-6 text-neutral-900 shadow-2xl ring-1 ring-white/60 transition-transform active:scale-[0.97] sm:aspect-square"
    >
      <span className="grid size-24 place-items-center rounded-full bg-accent text-accent-fg shadow-accent transition-transform group-active:scale-90 sm:size-28">
        <Icon className="size-11 sm:size-12" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="text-2xl font-black tracking-tight sm:text-3xl">{label}</span>
    </button>
  );
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6 py-10 text-white"
      style={{ background: "var(--brand-gradient)" }}
    >
      <div className="landing-grid pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -end-32 -top-32 size-[28rem] rounded-full bg-white/10 blur-2xl"
        aria-hidden="true"
      />
      <div className="relative flex flex-col items-center text-center">
        <Logo brand={brand} className="size-24 rounded-[1.75rem] text-4xl shadow-2xl ring-4 ring-white/40" />
        <h1 className="mt-6 text-4xl font-black tracking-tight text-balance drop-shadow-sm sm:text-6xl">
          {brand.name}
        </h1>
        <p className="mt-3 text-lg font-semibold opacity-90 sm:text-2xl">{t("kioskChoose")}</p>
      </div>
      <div className="relative mt-10 grid w-full max-w-2xl grid-cols-2 gap-4 sm:gap-6">
        {door("dine_in", UtensilsCrossed, t("kioskEatIn"))}
        {door("takeaway", ShoppingBag, t("kioskTakeAway"))}
      </div>
    </div>
  );
}

type CartLine = { key: string; quantity: number; note: string };

/** The order, always in view beside the menu on a landscape tablet. */
export function KioskCart({
  lines,
  money,
  total,
  count,
  channel,
  onChannel,
  onQty,
  onCheckout,
  onStartOver,
  className,
}: {
  lines: { line: CartLine; product: PublicProduct | undefined; cents: number }[];
  money: (c: number) => string;
  total: number;
  count: number;
  channel: KioskChannel;
  onChannel: (c: KioskChannel) => void;
  onQty: (key: string, q: number) => void;
  onCheckout: () => void;
  onStartOver: () => void;
  className?: string;
}) {
  const t = useTranslations("online");
  return (
    <aside
      className={cn(
        "sticky top-0 h-dvh flex-col border-s border-border bg-surface shadow-[var(--shadow-float-sm)]",
        className,
      )}
      aria-label={t("checkout")}
    >
      <div className="border-b border-border p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-black tracking-tight">{t("checkout")}</h2>
          {count ? (
            <span className="kashi-btn grid h-7 min-w-7 place-items-center bg-accent px-2 text-sm font-bold text-accent-fg tabular-nums [--cut:5px]">
              {count}
            </span>
          ) : null}
        </div>
        <ChannelSwitch channel={channel} onChannel={onChannel} className="mt-4" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {lines.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <span className="kashi-tile mx-auto grid size-20 place-items-center bg-accent-soft text-accent-text">
                <ShoppingBag className="size-9" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <p className="mt-4 text-[15px] leading-7 text-fg-muted">{t("kioskCartEmpty")}</p>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {lines.map(({ line, product, cents }) => (
              <li
                key={line.key}
                className="animate-pop-in flex gap-3 rounded-2xl bg-surface-2/60 p-3 ring-1 ring-border/70"
              >
                {product?.images[0] ? (
                  <img
                    src={product.images[0].sm}
                    alt=""
                    className="size-16 shrink-0 rounded-xl bg-surface-2 object-cover"
                  />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="line-clamp-2 leading-6 font-bold">{product?.name ?? "—"}</p>
                  {line.note ? <p className="truncate text-xs text-fg-muted">« {line.note} »</p> : null}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <Amount text={money(cents)} className="font-extrabold text-accent-text" />
                    <QuantityStepper
                      size="md"
                      value={line.quantity}
                      onChange={(q) => onQty(line.key, q)}
                      onRemove={() => onQty(line.key, 0)}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-3 border-t border-border p-5">
        <div className="flex items-baseline justify-between">
          <span className="font-bold text-fg-muted">{t("total")}</span>
          <Amount text={money(total)} className="text-2xl font-black" />
        </div>
        <button
          type="button"
          disabled={count === 0}
          onClick={onCheckout}
          className="flex h-16 w-full items-center justify-center gap-2 rounded-full bg-accent text-lg font-black text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.22),var(--shadow-accent)] transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          {t("kioskContinue")}
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-bold text-fg-muted hover:bg-surface-2"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          {t("kioskStartOver")}
        </button>
      </div>
    </aside>
  );
}

/** The end: the order's number, big, and the card payment when a terminal is plugged in. */
export function KioskDone({
  number,
  hint,
  payment,
  onNext,
}: {
  number: string;
  /** The card payment block, or the "pay at the counter" line. */
  payment: ReactNode;
  hint?: string;
  onNext: () => void;
}) {
  const t = useTranslations("online");
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto px-6 py-10 text-center text-white"
      style={{ background: "var(--brand-gradient)" }}
      role="status"
    >
      <div className="landing-grid pointer-events-none absolute inset-0 opacity-20" aria-hidden="true" />
      <div className="relative w-full max-w-lg">
        <span className="animate-pop-in kashi-tile mx-auto grid size-20 place-items-center bg-white text-success shadow-2xl">
          <Check className="size-10" strokeWidth={3} aria-hidden="true" />
        </span>
        <p className="mt-6 text-xl font-bold opacity-95 sm:text-2xl">{t("kioskThanks")}</p>
        <div className="mx-auto mt-5 w-fit rounded-[2rem] bg-white px-12 py-6 shadow-2xl">
          <p
            className="text-7xl font-black tracking-tight text-accent-text tabular-nums sm:text-8xl"
            dir="ltr"
          >
            {number}
          </p>
        </div>
        <div className="mx-auto mt-8 max-w-sm">{payment}</div>
        {hint ? <p className="mx-auto mt-4 max-w-sm text-base opacity-90">{hint}</p> : null}
        <button
          type="button"
          onClick={onNext}
          className="kashi-btn mt-10 inline-flex h-14 items-center gap-2 bg-black/25 px-8 text-lg font-bold backdrop-blur transition-colors hover:bg-black/35"
        >
          <RotateCcw className="size-5" aria-hidden="true" />
          {t("kioskNext")}
        </button>
      </div>
    </div>
  );
}

/** Card payment on the kiosk's terminal (white card on the brand background). */
export function KioskPayCard({
  amount,
  state,
  onPay,
}: {
  amount: string;
  state: "idle" | "waiting" | "failed";
  onPay: () => void;
}) {
  const t = useTranslations("online");
  return (
    <div className="rounded-3xl bg-white p-5 text-neutral-900 shadow-2xl">
      <Amount text={amount} className="text-3xl font-black" />
      <button
        type="button"
        disabled={state === "waiting"}
        onClick={onPay}
        className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-base font-bold text-accent-fg shadow-accent disabled:opacity-60"
      >
        <CreditCard className={cn("size-5", state === "waiting" && "animate-pulse")} aria-hidden="true" />
        {state === "waiting" ? t("kioskCardWaiting") : t("kioskPayCard")}
      </button>
      {state === "failed" ? <p className="mt-3 text-sm text-danger">{t("kioskCardFailed")}</p> : null}
      <p className="mt-3 text-sm text-neutral-500">{t("kioskOrPayCounter")}</p>
    </div>
  );
}
