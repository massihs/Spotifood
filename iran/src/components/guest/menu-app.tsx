"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addToCartAction, cartSummaryAction, removeOneAction } from "@/app/[locale]/table/actions";
import { Toast } from "@/components/ui/toast";
import { useMoney } from "@/components/ui/use-money";
import { cn } from "@/lib/cn";
import { formatThousandTomans, isToman } from "@/lib/money";
import type { MenuTheme } from "@/lib/menu-themes";
import type { PublicMenu, PublicProduct } from "@/server/modules/menu/public";
import { CartBar } from "./cart-bar";
import { MenuBrowser } from "./menu-browser";
import { canQuickAdd, initialSelection, type CartSummary } from "./parts";
import dynamic from "next/dynamic";

/**
 * The dish sheet opens on a tap: its code is not part of the first load of the menu (lighter on
 * mobile data). It is fetched quietly once the menu is shown, so opening a dish stays instant.
 */
const loadSheet = () => import("./product-sheet");
const ProductSheet = dynamic(() => loadSheet().then((m) => m.ProductSheet), { ssr: false });

export type { CartSummary };
export { useMoney };

const defaultsOf = (p: PublicProduct) =>
  [...initialSelection(p.optionGroups).values()].flatMap((s) => [...s]);

export function MenuApp({
  menu,
  currency,
  initialCart,
  popularIds,
  header,
  restaurantName,
  tableLabel,
  room = false,
  theme,
  shortPrices,
}: {
  menu: PublicMenu;
  currency: string;
  initialCart: CartSummary;
  popularIds: string[];
  header: ReactNode;
  restaurantName: string;
  tableLabel: string;
  /** Ordering from a hotel room (room service). */
  room?: boolean;
  theme: MenuTheme;
  /** Menu prices in thousand tomans (the unit is shown once per section). */
  shortPrices: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const money = useMoney(currency);
  const short = shortPrices && isToman(currency);
  const listMoney = useCallback(
    (c: number) => (short ? formatThousandTomans(c, locale) : money(c)),
    [short, locale, money],
  );
  const [compact, setCompact] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cart, setCart] = useState(initialCart);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const pending = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const popular = useMemo(
    () => new Set(popularIds.filter((id) => menu.products[id]?.isAvailable)),
    [popularIds, menu],
  );

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    idle(() => void loadSheet());
  }, []);

  // Compact bar once the header has scrolled away.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) =>
      setCompact(!!e && !e.isIntersecting && e.boundingClientRect.top < 0),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const errorText = (code: string) =>
    t.has(`errorCodes.${code}`) ? t(`errorCodes.${code}`) : t("errorCodes.internal");

  /**
   * One unit more or less from a card: the count changes at once, the server calls follow one
   * after the other, and the last answer (the whole cart) settles the bar.
   */
  const step = (p: PublicProduct, delta: 1 | -1) => {
    const first = delta > 0 && !cart.byProduct[p.id];
    setCart((c) => ({
      ...c,
      itemCount: Math.max(0, c.itemCount + delta),
      byProduct: { ...c.byProduct, [p.id]: Math.max(0, (c.byProduct[p.id] ?? 0) + delta) },
    }));
    navigator.vibrate?.(delta > 0 ? 20 : 10);
    if (first) setToast(t("guest.added"));
    pending.current += 1;
    const resync = async (error?: string) => {
      const fresh = await cartSummaryAction().catch(() => null);
      if (fresh?.ok && fresh.data) setCart(fresh.data);
      setToast(errorText(error ?? "internal"));
    };
    chain.current = chain.current
      .then(async () => {
        const res =
          delta > 0
            ? await addToCartAction({ productId: p.id, optionValueIds: defaultsOf(p), quantity: 1, note: "" })
            : await removeOneAction(p.id);
        pending.current -= 1;
        if (res && !res.ok) return resync(res.error);
        // A newer tap is on its way: its answer will carry the final cart.
        if (pending.current === 0 && res?.ok && res.data) setCart(res.data);
      })
      .catch(() => {
        pending.current = Math.max(0, pending.current - 1);
        return resync();
      });
  };

  /** "+": dishes whose defaults are enough go straight to the cart, the others open. */
  const add = (p: PublicProduct) => (canQuickAdd(p) ? step(p, 1) : setOpenId(p.id));

  /** Dishes to suggest with this one: best sellers and house picks from other categories first. */
  const suggestionsFor = (p: PublicProduct) => {
    const all = Object.values(menu.products).filter((x) => x.id !== p.id && x.isAvailable && x.images[0]);
    const score = (x: PublicProduct) =>
      (x.categoryId !== p.categoryId ? 4 : 0) + (popular.has(x.id) ? 2 : 0) + (x.isFeatured ? 1 : 0);
    return all
      .filter((x) => score(x) > 0)
      .sort((a, b) => score(b) - score(a))
      .slice(0, 8);
  };

  const open = openId ? menu.products[openId] : null;

  return (
    <>
      {header}
      {/* Marks the end of the header: past it, the compact bar takes over. */}
      <div ref={sentinel} aria-hidden="true" />
      <div
        className={cn(
          "fixed inset-x-0 top-0 z-30 border-b border-border bg-bg transition-transform duration-200",
          compact ? "translate-y-0" : "-translate-y-full",
        )}
        aria-hidden={!compact}
      >
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-3 px-4 pt-[env(safe-area-inset-top)] lg:max-w-6xl">
          <p className="min-w-0 flex-1 truncate font-menu-display text-[17px] font-semibold">
            {restaurantName}
          </p>
          <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-text">
            {t(room ? "guest.tableBadgeRoom" : "guest.tableBadge", { table: tableLabel })}
          </span>
        </div>
      </div>
      <main className="mx-auto max-w-3xl lg:max-w-6xl">
        <MenuBrowser
          menu={menu}
          money={listMoney}
          shortPrices={short}
          popular={popular}
          counts={cart.byProduct}
          theme={theme}
          belowFixedBar={compact}
          onOpen={setOpenId}
          onAdd={add}
          onRemove={(p) => step(p, -1)}
        />
      </main>

      {cart.itemCount > 0 ? (
        <CartBar
          count={cart.itemCount}
          total={money(cart.totalCents)}
          label={t("guest.viewCart")}
          href="/table/cart"
        />
      ) : null}

      {open ? (
        <ProductSheet
          key={open.id}
          product={open}
          currency={currency}
          popular={popular.has(open.id)}
          inCart={cart.byProduct[open.id] ?? 0}
          suggestions={suggestionsFor(open)}
          onPick={setOpenId}
          onClose={() => setOpenId(null)}
          onAdded={(summary) => {
            setCart(summary);
            setOpenId(null);
            navigator.vibrate?.(20);
            setToast(t("guest.added"));
          }}
        />
      ) : null}
      <Toast
        message={toast}
        onDone={clearToast}
        duration={2200}
        className="bottom-[calc(5.5rem+env(safe-area-inset-bottom))]"
      />
    </>
  );
}
