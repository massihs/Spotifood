"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Bike, Minus, Plus, Store, UtensilsCrossed } from "lucide-react";
import { DinerLogin } from "@/components/account/diner-login";
import { CartBar } from "@/components/guest/cart-bar";
import { MenuBrowser } from "@/components/guest/menu-browser";
import { canQuickAdd, initialSelection } from "@/components/guest/parts";
import { ProductSheet } from "@/components/guest/product-sheet";
import { Toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { useMoney } from "@/components/ui/use-money";
import { getPathname } from "@/i18n/navigation";
import { forChannel } from "@/lib/channel-price";
import { cn } from "@/lib/cn";
import type { MenuTheme } from "@/lib/menu-themes";
import { formatThousandTomans, isToman } from "@/lib/money";
import type { PublicMenu, PublicProduct } from "@/server/modules/menu/public";
import { priceLine } from "@/server/modules/pricing";
import { payOnlineOrderAction, placeKioskOrderAction, placeOnlineOrderAction } from "./actions";

type Channel = "dine_in" | "takeaway" | "delivery";
type Line = { key: string; productId: string; optionValueIds: string[]; quantity: number; note: string };
type Zone = { id: string; name: string; feeCents: number; minOrderCents: number };

const storageKey = (slug: string) => `spotifood:online-cart:${slug}`;
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** The online ordering site: menu, browser-side cart, checkout with a verified mobile. */
export function OrderApp({
  slug,
  menu,
  currency,
  takeaway,
  delivery,
  zones,
  signedIn,
  hasPhone,
  defaultName,
  kioskToken,
  paymentProvider = null,
  payOnSite = true,
  popularIds = [],
  theme = "doux",
  shortPrices = false,
}: {
  /** Best sellers (badge and filter). */
  popularIds?: string[];
  /** The restaurant's menu look (same as on its tables). */
  theme?: MenuTheme;
  /** Menu prices in thousand tomans (the unit is shown once per section). */
  shortPrices?: boolean;
  /** Online PSP the restaurant takes (null: pay at pickup / on delivery only). */
  paymentProvider?: string | null;
  /** Paying at pickup / on delivery is allowed. */
  payOnSite?: boolean;
  /** Kiosk mode: eat in / take away, no sign-in, the order number shown big, then a new customer. */
  kioskToken?: string;
  slug: string;
  menu: PublicMenu;
  currency: string;
  takeaway: boolean;
  delivery: boolean;
  zones: Zone[];
  signedIn: boolean;
  hasPhone: boolean;
  defaultName: string;
}) {
  const t = useTranslations("online");
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const money = useMoney(currency);
  const kiosk = Boolean(kioskToken);
  const [channel, setChannel] = useState<Channel>(kiosk ? "dine_in" : takeaway ? "takeaway" : "delivery");
  const canPayOnline = !kiosk && Boolean(paymentProvider);
  const [payment, setPayment] = useState<"online" | "on_site">(canPayOnline ? "online" : "on_site");
  const [phone, setPhone] = useState("");
  const [placed, setPlaced] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [name, setName] = useState(defaultName);
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [coupon, setCoupon] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const short = shortPrices && isToman(currency);
  const listMoney = useCallback(
    (c: number) => (short ? formatThousandTomans(c, locale) : money(c)),
    [short, locale, money],
  );

  // The cart survives a reload and the SMS sign-in round trip.
  useEffect(() => {
    if (kiosk) return;
    try {
      const raw = localStorage.getItem(storageKey(slug));
      // After the first paint, so the server and client renders match.
      if (raw) queueMicrotask(() => setLines(JSON.parse(raw) as Line[]));
    } catch {}
  }, [slug, kiosk]);
  useEffect(() => {
    if (kiosk) return;
    try {
      localStorage.setItem(storageKey(slug), JSON.stringify(lines));
    } catch {}
  }, [slug, lines, kiosk]);
  // Kiosk: the number stays on screen, then the tablet is ready for the next customer.
  useEffect(() => {
    if (!placed) return;
    const id = setTimeout(() => {
      setPlaced(null);
      setCheckout(false);
      setName("");
      setPhone("");
      setNote("");
      setCoupon("");
    }, 15_000);
    return () => clearTimeout(id);
  }, [placed]);

  const productFor = (id: string): PublicProduct | undefined => {
    const p = menu.products[id];
    return p ? forChannel(p, channel) : undefined;
  };
  // Prices of the chosen channel (takeaway / delivery / eat in), as the lists show them.
  const channelMenu = useMemo(
    () => ({
      ...menu,
      products: Object.fromEntries(
        Object.entries(menu.products).map(([id, p]) => [id, forChannel(p, channel)]),
      ),
    }),
    [menu, channel],
  );
  const popular = useMemo(
    () => new Set(popularIds.filter((id) => menu.products[id]?.isAvailable)),
    [popularIds, menu],
  );
  const counts = useMemo(() => {
    const byProduct: Record<string, number> = {};
    for (const l of lines) byProduct[l.productId] = (byProduct[l.productId] ?? 0) + l.quantity;
    return byProduct;
  }, [lines]);
  const priced = useMemo(
    () =>
      lines.map((l) => {
        const p = productFor(l.productId);
        const r = p ? priceLine(p, l.optionValueIds, l.quantity) : null;
        return { line: l, product: p, cents: r?.ok ? r.line.lineTotalCents : 0, ok: Boolean(r?.ok) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, channel, menu],
  );
  const subtotal = priced.reduce((s, x) => s + x.cents, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const zone = zones.find((z) => z.id === zoneId);
  const fee = channel === "delivery" ? (zone?.feeCents ?? 0) : 0;
  const belowMin = channel === "delivery" && zone ? subtotal < zone.minOrderCents : false;
  const summary = (next: Line[]) => {
    const byProduct: Record<string, number> = {};
    for (const l of next) byProduct[l.productId] = (byProduct[l.productId] ?? 0) + l.quantity;
    return { itemCount: next.reduce((s, l) => s + l.quantity, 0), totalCents: 0, byProduct };
  };
  const setQty = (key: string, q: number) =>
    setLines((ls) =>
      q <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, quantity: q } : l)),
    );
  /** A line into the cart; the same dish with the same choices and note adds up on one line. */
  const addLine = (productId: string, l: { optionValueIds: string[]; quantity: number; note: string }) => {
    const next = [...lines];
    const same = next.findIndex(
      (x) => x.productId === productId && x.note === l.note && sameIds(x.optionValueIds, l.optionValueIds),
    );
    if (same >= 0) next[same] = { ...next[same]!, quantity: next[same]!.quantity + l.quantity };
    else next.push({ ...l, productId, key: `${productId}:${Date.now()}` });
    setLines(next);
    return next;
  };
  /** "+" on a card: dishes whose defaults are enough go straight to the cart, the others open. */
  const quickAdd = (p: PublicProduct) => {
    if (!canQuickAdd(p)) return setOpen(p.id);
    const first = !counts[p.id];
    addLine(p.id, {
      optionValueIds: [...initialSelection(p.optionGroups).values()].flatMap((x) => [...x]),
      quantity: 1,
      note: "",
    });
    navigator.vibrate?.(20);
    if (first) setToast(te("guest.added"));
  };
  /** "−" on a card: one unit less, from the dish's most recent line. */
  const removeOne = (p: PublicProduct) => {
    const last = [...lines].reverse().find((l) => l.productId === p.id);
    if (last) setQty(last.key, last.quantity - 1);
    navigator.vibrate?.(10);
  };

  const place = () =>
    startTransition(async () => {
      setError(null);
      if (kioskToken) {
        const res = await placeKioskOrderAction(kioskToken, {
          channel,
          lines: lines.map(({ productId, optionValueIds, quantity, note }) => ({
            productId,
            optionValueIds,
            quantity,
            note,
          })),
          customerName: name,
          phone,
          note,
          couponCode: coupon,
        });
        if (res?.ok && res.data) {
          setLines([]);
          setPlaced(res.data.number);
          return;
        }
        const code = res?.ok === false ? res.error : "internal";
        setError(te.has(`errorCodes.${code}`) ? te(`errorCodes.${code}`) : te("errorCodes.internal"));
        return;
      }
      const res = await placeOnlineOrderAction(slug, {
        channel,
        lines: lines.map(({ productId, optionValueIds, quantity, note }) => ({
          productId,
          optionValueIds,
          quantity,
          note,
        })),
        customerName: name,
        deliveryAddress: channel === "delivery" ? address : "",
        deliveryZoneId: channel === "delivery" ? zoneId || null : null,
        note,
        couponCode: coupon,
        payment: canPayOnline ? payment : "on_site",
      });
      if (res?.ok && res.data) {
        setLines([]);
        const track = getPathname({ href: `/r/${slug}/o/${res.data.orderId}`, locale });
        if (canPayOnline && payment === "online") {
          // Straight to the bank's page; if that fails, the order page offers to pay again.
          const pay = await payOnlineOrderAction(
            slug,
            res.data.orderId,
            paymentProvider!,
            crypto.randomUUID(),
          );
          if (pay?.ok && pay.data?.redirectUrl) {
            window.location.assign(pay.data.redirectUrl);
            return;
          }
        }
        router.push(track);
        return;
      }
      const code = res?.ok === false ? res.error : "internal";
      setError(te.has(`errorCodes.${code}`) ? te(`errorCodes.${code}`) : te("errorCodes.internal"));
    });

  const opened = open ? productFor(open) : undefined;

  return (
    <div className="pb-28">
      {kiosk || (takeaway && delivery) ? (
        <div className="mx-4 mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1" role="tablist">
          {(kiosk
            ? ([
                ["dine_in", UtensilsCrossed, t("dineIn")],
                ["takeaway", Store, t("takeaway")],
              ] as const)
            : ([
                ["takeaway", Store, t("takeaway")],
                ["delivery", Bike, t("delivery")],
              ] as const)
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={channel === id}
              onClick={() => setChannel(id)}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold",
                channel === id ? "bg-surface shadow-[var(--shadow-soft)]" : "text-fg-muted",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mx-4 mt-4 text-sm font-semibold text-fg-muted">
          {channel === "delivery" ? t("deliveryOnly") : t("takeawayOnly")}
        </p>
      )}

      <MenuBrowser
        menu={channelMenu}
        money={listMoney}
        shortPrices={short}
        popular={popular}
        counts={counts}
        theme={theme}
        defaultView={kiosk ? "grid" : "list"}
        onOpen={setOpen}
        onAdd={quickAdd}
        onRemove={removeOne}
      />

      {opened ? (
        <ProductSheet
          key={opened.id}
          product={opened}
          currency={currency}
          popular={popular.has(opened.id)}
          inCart={counts[opened.id] ?? 0}
          onClose={() => setOpen(null)}
          onAdded={() => {
            setOpen(null);
            navigator.vibrate?.(20);
            setToast(te("guest.added"));
          }}
          addLocal={(l) => summary(addLine(opened.id, l))}
        />
      ) : null}

      {count > 0 && !checkout ? (
        <CartBar
          count={count}
          total={money(subtotal)}
          label={te("guest.viewCart")}
          onClick={() => setCheckout(true)}
        />
      ) : null}
      <Toast
        message={toast}
        onDone={clearToast}
        duration={2200}
        className="bottom-[calc(5.5rem+env(safe-area-inset-bottom))]"
      />

      {checkout ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40"
          onClick={() => setCheckout(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("checkout")}
            className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-bg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{t("checkout")}</h2>
              <button type="button" className="text-sm text-fg-muted" onClick={() => setCheckout(false)}>
                {t("back")}
              </button>
            </div>
            <ul className="mt-4 divide-y divide-border rounded-2xl bg-surface ring-1 ring-border">
              {priced.map(({ line, product, cents, ok }) => (
                <li key={line.key} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{product?.name ?? "—"}</span>
                    {!ok ? (
                      <span className="text-xs text-danger">{te("errorCodes.product_unavailable")}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={t("less")}
                      className="grid size-8 place-items-center rounded-full bg-surface-2"
                      onClick={() => setQty(line.key, line.quantity - 1)}
                    >
                      <Minus className="size-4" aria-hidden="true" />
                    </button>
                    <span className="w-5 text-center tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={t("more")}
                      className="grid size-8 place-items-center rounded-full bg-surface-2"
                      onClick={() => setQty(line.key, line.quantity + 1)}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </button>
                  </span>
                  <span className="w-24 text-end font-semibold tabular-nums">{money(cents)}</span>
                </li>
              ))}
            </ul>

            {!kiosk && (!signedIn || !hasPhone) ? (
              <div className="mt-5 rounded-2xl bg-surface p-4 ring-1 ring-border">
                <p className="mb-3 text-sm font-semibold">{t("signIn")}</p>
                <DinerLogin phoneOnly />
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  placeholder={t("name")}
                  aria-label={t("name")}
                  maxLength={120}
                  className="h-12 w-full rounded-2xl border border-border bg-surface px-4 text-sm"
                />
                {kiosk ? (
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.currentTarget.value)}
                    placeholder={t("phoneOptional")}
                    aria-label={t("phoneOptional")}
                    inputMode="tel"
                    dir="ltr"
                    maxLength={20}
                    className="h-12 w-full rounded-2xl border border-border bg-surface px-4 text-sm"
                  />
                ) : null}
                {channel === "delivery" ? (
                  <>
                    <select
                      value={zoneId}
                      onChange={(e) => setZoneId(e.currentTarget.value)}
                      aria-label={t("zone")}
                      className="h-12 w-full rounded-2xl border border-border bg-surface px-3 text-sm"
                    >
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} · {t("fee", { fee: money(z.feeCents) })}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.currentTarget.value)}
                      placeholder={t("address")}
                      aria-label={t("address")}
                      rows={2}
                      maxLength={500}
                      className="w-full rounded-2xl border border-border bg-surface p-3 text-sm"
                    />
                  </>
                ) : null}
                <input
                  value={note}
                  onChange={(e) => setNote(e.currentTarget.value)}
                  placeholder={t("note")}
                  aria-label={t("note")}
                  maxLength={500}
                  className="h-12 w-full rounded-2xl border border-border bg-surface px-4 text-sm"
                />
                <input
                  value={coupon}
                  onChange={(e) => setCoupon(e.currentTarget.value)}
                  placeholder={t("coupon")}
                  aria-label={t("coupon")}
                  dir="ltr"
                  maxLength={32}
                  className="h-12 w-full rounded-2xl border border-border bg-surface px-4 text-sm uppercase"
                />
                <dl className="space-y-1 rounded-2xl bg-surface-2 p-4 text-sm">
                  <div className="flex justify-between">
                    <dt>{t("subtotal")}</dt>
                    <dd className="tabular-nums">{money(subtotal)}</dd>
                  </div>
                  {channel === "delivery" ? (
                    <div className="flex justify-between">
                      <dt>{t("deliveryFee")}</dt>
                      <dd className="tabular-nums">{money(fee)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-base font-bold">
                    <dt>{t("total")}</dt>
                    <dd className="tabular-nums">{money(subtotal + fee)}</dd>
                  </div>
                  {!canPayOnline ? (
                    <p className="pt-1 text-xs text-fg-muted">
                      {kiosk
                        ? t("payAtCounter")
                        : channel === "delivery"
                          ? t("payOnDelivery")
                          : t("payAtPickup")}
                    </p>
                  ) : null}
                </dl>
                {canPayOnline ? (
                  <fieldset className="grid gap-2" aria-label={t("payment.title")}>
                    <legend className="mb-1 text-sm font-semibold">{t("payment.title")}</legend>
                    {(["online", "on_site"] as const)
                      .filter((m) => m === "online" || payOnSite)
                      .map((m) => (
                        <label
                          key={m}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-sm transition-colors",
                            payment === m ? "border-accent bg-accent-soft/50" : "border-border bg-surface",
                          )}
                        >
                          <input
                            type="radio"
                            name="payment"
                            checked={payment === m}
                            onChange={() => setPayment(m)}
                            className="size-4 accent-[var(--accent)]"
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold">
                              {m === "online"
                                ? t("payment.online")
                                : channel === "delivery"
                                  ? t("payment.switchDelivery")
                                  : t("payment.switchPickup")}
                            </span>
                            {m === "online" ? (
                              <span className="block text-xs text-fg-muted">{t("payment.onlineHint")}</span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                  </fieldset>
                ) : null}
                {belowMin ? (
                  <p className="text-sm text-danger">
                    {t("belowMin", { amount: money(zone!.minOrderCents) })}
                  </p>
                ) : null}
                {error ? (
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                ) : null}
                <Button
                  size="lg"
                  className="w-full"
                  disabled={
                    pending ||
                    count === 0 ||
                    !name.trim() ||
                    belowMin ||
                    (channel === "delivery" && address.trim().length < 5)
                  }
                  onClick={place}
                >
                  {canPayOnline && payment === "online"
                    ? t("payment.payNow", { total: money(subtotal + fee) })
                    : t("place", { total: money(subtotal + fee) })}
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {placed ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-bg p-6 text-center" role="status">
          <div>
            <p className="text-lg text-fg-muted">{t("kioskThanks")}</p>
            <p className="mt-4 text-8xl font-black tabular-nums" dir="ltr">
              {placed}
            </p>
            <p className="mt-6 max-w-sm text-base text-fg-muted">{t("kioskHint")}</p>
            <Button
              size="lg"
              className="mt-8"
              onClick={() => {
                setPlaced(null);
                setCheckout(false);
                setName("");
                setPhone("");
                setNote("");
                setCoupon("");
              }}
            >
              {t("kioskNext")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
