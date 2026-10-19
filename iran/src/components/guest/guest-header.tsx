import { Clock, MapPin, ReceiptText, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import type { OpenState } from "@/lib/opening";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { WaiterCall } from "./waiter-call";
import { Link } from "@/i18n/navigation";
import { isLocale, type AppLocale } from "@/i18n/config";
import { menuThemeOf } from "@/lib/menu-themes";
import { cn } from "@/lib/cn";
import type { GuestContext } from "@/server/modules/guest/sessions";
import { logoUrl } from "@/server/modules/restaurants/settings";

type Store = { open: OpenState; address: string | null };

/**
 * The top of the guest menu, composed per menu theme:
 *   atelier — no cover, the name set large in the serif, centered like a printed menu;
 *   nuit    — the signature dish full-bleed, the name over it;
 *   doux    — a cover photo with the identity card overlapping it.
 */
export async function GuestHeader({
  guest,
  orderCount = 0,
  cover,
  store,
}: {
  store?: Store;
  guest: GuestContext;
  orderCount?: number;
  cover?: { md: string; lg: string } | null;
}) {
  const t = await getTranslations("guest");
  const theme = menuThemeOf(guest.restaurant.menuTheme);
  const logo = logoUrl(guest.restaurant.logoKey);
  const who = guest.participant.displayName ?? t("you", { n: guest.participant.seq });
  const locales = guest.restaurant.enabledLocales.filter(isLocale) as AppLocale[];
  const name = guest.restaurant.name;

  const actions = (
    <div className="flex items-center justify-end gap-2">
      {orderCount > 0 ? (
        <Link
          href="/table/orders"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface/95 px-3.5 text-sm font-semibold text-fg shadow-sm backdrop-blur atelier:shadow-none atelier:ring-1 atelier:ring-border"
        >
          <ReceiptText className="size-4 text-accent-text" aria-hidden="true" />
          {t("ordersLink", { count: orderCount })}
        </Link>
      ) : null}
      {locales.length > 1 ? (
        <LanguageSwitcher
          locales={locales}
          className="bg-surface/95 text-fg shadow-sm backdrop-blur atelier:shadow-none atelier:ring-1 atelier:ring-border"
        />
      ) : null}
    </div>
  );
  const logoTile = (className: string) => (
    <div className={cn("grid shrink-0 place-items-center overflow-hidden bg-white", className)}>
      {logo ? (
        <img src={logo} alt="" width={64} height={64} className="size-full object-contain p-1" />
      ) : (
        <span className="text-2xl font-bold text-neutral-800" aria-hidden="true">
          {[...name.trim()][0] ?? "S"}
        </span>
      )}
    </div>
  );
  const guestLine = (
    <>
      <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent-text">
        {t("tableBadge", { table: guest.table.label })}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1 text-fg-muted">
        <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{who}</span>
      </span>
    </>
  );

  if (theme === "atelier")
    return (
      <header className="mx-auto max-w-3xl px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 text-center">
        {actions}
        {logoTile("mx-auto mt-4 size-16 rounded-full ring-1 ring-border")}
        <h1 className="mt-4 font-menu-display text-[44px] leading-[0.95] font-medium text-balance">{name}</h1>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm">{guestLine}</div>
        <StoreLine t={t} store={store} className="justify-center" />
        <div className="mt-4 flex justify-center">
          <WaiterCall />
        </div>
      </header>
    );

  if (theme === "nuit")
    return (
      <header className="relative">
        <div className="relative h-80 overflow-hidden sm:h-96">
          {cover ? (
            <img
              src={cover.lg}
              srcSet={`${cover.md} 640w, ${cover.lg} 1280w`}
              sizes="100vw"
              alt=""
              fetchPriority="high"
              className="absolute inset-0 size-full object-cover"
            />
          ) : null}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/10 to-[var(--bg)]"
          />
          <div className="relative mx-auto max-w-3xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            {actions}
          </div>
          <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-3xl items-end gap-4 px-5 pb-4">
            <div className="min-w-0 flex-1">
              {logoTile("mb-3 size-12 rounded-xl")}
              <h1 className="font-menu-display text-4xl leading-tight font-medium">{name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">{guestLine}</div>
            </div>
            <WaiterCall />
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-5">
          <StoreLine t={t} store={store} />
        </div>
      </header>
    );

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
        <div className="relative mx-auto max-w-3xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {actions}
        </div>
      </div>
      <div className="relative mx-auto -mt-12 max-w-3xl px-4">
        <div className="flex items-center gap-4 rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-float)]">
          {logoTile("size-16 rounded-2xl ring-1 ring-border")}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl leading-tight font-bold tracking-tight">{name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">{guestLine}</p>
          </div>
          <WaiterCall />
        </div>
        <StoreLine t={t} store={store} className="px-2" />
      </div>
    </header>
  );
}

/** Open now / closed, and the address. */
function StoreLine({
  t,
  store,
  className,
}: {
  t: (key: string, values?: Record<string, string>) => string;
  store?: Store;
  className?: string;
}): ReactNode {
  if (!store || (store.open.status === "unknown" && !store.address)) return null;
  return (
    <div
      className={cn(
        "mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-fg-muted",
        className,
      )}
    >
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
  );
}
