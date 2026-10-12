import { ReceiptText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "@/i18n/navigation";
import { isLocale, type AppLocale } from "@/i18n/config";
import type { GuestContext } from "@/server/modules/guest/sessions";
import { logoUrl } from "@/server/modules/restaurants/settings";

/**
 * Store hero: always-black band (in both themes) with the restaurant's identity and the
 * guest's seat, the menu then slides over it on a rounded white sheet.
 */
export async function GuestHeader({ guest, orderCount = 0 }: { guest: GuestContext; orderCount?: number }) {
  const t = await getTranslations("guest");
  const logo = logoUrl(guest.restaurant.logoKey);
  const who = guest.participant.displayName ?? t("you", { n: guest.participant.seq });
  const locales = guest.restaurant.enabledLocales.filter(isLocale) as AppLocale[];
  return (
    <header className="relative overflow-hidden bg-[#0b0b0b] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-10 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -end-24 -top-24 size-72 rounded-full bg-accent/25 blur-3xl"
      />
      <div className="relative flex items-center justify-end gap-2">
        {orderCount > 0 ? (
          <Link
            href="/table/orders"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-semibold text-accent-fg"
          >
            <ReceiptText className="size-4" aria-hidden="true" />
            {t("ordersLink", { count: orderCount })}
          </Link>
        ) : null}
        {locales.length > 1 ? <LanguageSwitcher locales={locales} tone="inverted" /> : null}
      </div>
      <div className="relative mt-5 flex items-center gap-3.5">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-lg">
          {logo ? (
            <img src={logo} alt="" width={64} height={64} className="size-full object-contain p-1" />
          ) : (
            <span className="text-3xl font-black text-[#0b0b0b]" aria-hidden="true">
              {[...guest.restaurant.name.trim()][0] ?? "S"}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-tight font-extrabold tracking-tight">
            {guest.restaurant.name}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-white/70">
            <span className="rounded-full bg-white/12 px-2.5 py-0.5 font-semibold text-white">
              {t("tableBadge", { table: guest.table.label })}
            </span>
            <span className="truncate">{who}</span>
          </p>
        </div>
      </div>
    </header>
  );
}
