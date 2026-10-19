import { Clock, MapPin, ReceiptText, UserRound } from "lucide-react";
import type { OpenState } from "@/lib/opening";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { WaiterCall } from "./waiter-call";
import { Link } from "@/i18n/navigation";
import { isLocale, type AppLocale } from "@/i18n/config";
import type { GuestContext } from "@/server/modules/guest/sessions";
import { logoUrl } from "@/server/modules/restaurants/settings";

/**
 * Store hero: a cover photo (the house's signature dish) under a soft gradient, with the
 * restaurant's identity card overlapping it, the way delivery apps present a store.
 */
export async function GuestHeader({
  guest,
  orderCount = 0,
  cover,
  store,
}: {
  store?: { open: OpenState; address: string | null };
  guest: GuestContext;
  orderCount?: number;
  cover?: { md: string; lg: string } | null;
}) {
  const t = await getTranslations("guest");
  const logo = logoUrl(guest.restaurant.logoKey);
  const who = guest.participant.displayName ?? t("you", { n: guest.participant.seq });
  const locales = guest.restaurant.enabledLocales.filter(isLocale) as AppLocale[];
  return (
    <header className="relative">
      <div className="relative h-48 overflow-hidden bg-gradient-to-br from-accent to-accent-hover sm:h-60">
        {cover ? (
          <img
            src={cover.lg}
            srcSet={`${cover.md} 640w, ${cover.lg} 1280w`}
            sizes="100vw"
            alt=""
            fetchPriority="high"
            className="absolute inset-0 size-full scale-105 object-cover"
          />
        ) : null}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/5 to-black/35"
        />
        <div className="relative mx-auto flex max-w-3xl items-center justify-end gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {orderCount > 0 ? (
            <Link
              href="/table/orders"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/95 px-3.5 text-sm font-semibold text-fg shadow-sm backdrop-blur"
            >
              <ReceiptText className="size-4 text-accent-text" aria-hidden="true" />
              {t("ordersLink", { count: orderCount })}
            </Link>
          ) : null}
          {locales.length > 1 ? (
            <LanguageSwitcher locales={locales} className="bg-white/95 shadow-sm backdrop-blur" />
          ) : null}
        </div>
      </div>

      <div className="relative mx-auto -mt-12 max-w-3xl px-4">
        <div className="flex items-center gap-4 rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-float)]">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white ring-1 ring-border">
            {logo ? (
              <img src={logo} alt="" width={64} height={64} className="size-full object-contain p-1" />
            ) : (
              <span className="text-2xl font-bold text-accent-text" aria-hidden="true">
                {[...guest.restaurant.name.trim()][0] ?? "S"}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl leading-tight font-bold tracking-tight">
              {guest.restaurant.name}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent-text">
                {t("tableBadge", { table: guest.table.label })}
              </span>
              <span className="inline-flex min-w-0 items-center gap-1 text-fg-muted">
                <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{who}</span>
              </span>
            </p>
          </div>
          <WaiterCall />
        </div>
        {store && (store.open.status !== "unknown" || store.address) ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2 text-[13px] text-fg-muted">
            {store.open.status === "open" ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-success" />
                </span>
                <span className="font-semibold text-success">{t("openNow")}</span>
                <span className="tabular-nums">{t("openUntil", { time: store.open.until })}</span>
              </span>
            ) : store.open.status === "closed" ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden="true" />
                <span className="font-semibold text-danger">{t("closedNow")}</span>
                {store.open.from ? <span>{t("opensAt", { time: store.open.from })}</span> : null}
              </span>
            ) : null}
            {store.address ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{store.address}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
