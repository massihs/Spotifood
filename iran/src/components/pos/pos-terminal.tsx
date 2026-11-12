"use client";

import {
  Banknote,
  Check,
  ChefHat,
  CreditCard,
  ImageIcon,
  LayoutGrid,
  Rows3,
  Loader2,
  Minus,
  Percent,
  Plus,
  Search,
  ShoppingBag,
  Bike,
  BookUser,
  MapPin,
  Smartphone,
  Star,
  Ticket,
  Trash2,
  UtensilsCrossed,
  X,
  Zap,
  MonitorSmartphone,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePref, writePref } from "@/components/ui/use-pref";
import { CategoryIcon } from "@/components/category-icon";
import { useMoney } from "@/components/ui/use-money";
import { cn } from "@/lib/cn";
import { couponDiscount } from "@/lib/coupon";
import { parseMoneyInput } from "@/lib/money";
import { normalizeIranMobile } from "@/lib/phone";
import { forChannel } from "@/lib/channel-price";
import { terminalBridge, useCardTerminal, type TerminalResult } from "@/lib/card-terminal";
import { makeDisplayPublisher } from "@/lib/customer-display";
import type { PublicMenu, PublicProduct } from "@/server/modules/menu/public";
import {
  checkCouponAction,
  createPosOrderAction,
  lookupCustomerAction,
} from "@/app/[locale]/dashboard/[restaurantId]/pos/actions";

type Line = { key: string; product: PublicProduct; optionValueIds: string[]; quantity: number; note: string };

const newKey = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Search folding for Persian/Arabic letter variants and case. */
const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .toLowerCase();

type Payment = {
  provider: "cash" | "on_site_terminal" | "account";
  tenderedCents: number | null;
  terminalRef?: string;
};

function unitPrice(p: PublicProduct, valueIds: string[]) {
  const deltas = p.optionGroups.flatMap((g) => g.values).filter((v) => valueIds.includes(v.id));
  return p.priceCents + deltas.reduce((s, v) => s + v.priceDeltaCents, 0);
}

export function PosTerminal({
  restaurantId,
  menu,
  currency,
  tables,
  methods,
  canPay,
  zones,
  initialPhone = "",
  initialChannel,
}: {
  /** Call centre: opened for a caller (phone and sales type prefilled). */
  initialPhone?: string;
  initialChannel?: "takeaway" | "dine_in" | "delivery";
  restaurantId: string;
  menu: PublicMenu;
  currency: string;
  tables: { id: string; label: string; kind?: string }[];
  methods: ("cash" | "on_site_terminal")[];
  canPay: boolean;
  zones: { id: string; name: string; feeCents: number; minOrderCents: number }[];
}) {
  const t = useTranslations("pos");
  const tErr = useTranslations("errorCodes");
  const money = useMoney(currency);
  const [category, setCategory] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [channel, setChannel] = useState<"takeaway" | "dine_in" | "delivery">(initialChannel ?? "takeaway");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [tableId, setTableId] = useState<string>("");
  const [phone, setPhone] = useState(initialPhone);
  const [discount, setDiscount] = useState(0);
  const [club, setClub] = useState<{
    phone: string;
    customer: {
      name: string | null;
      points: number;
      creditLimitCents: number | null;
      balanceCents: number;
    } | null;
    addresses: { id: string; label: string | null; address: string; zoneId: string | null }[];
    enabled: boolean;
    pointValueCents: number;
  } | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [usePoints, setUsePoints] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{
    code: string;
    kind: string;
    value: number;
    minOrderCents: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [picking, setPicking] = useState<PublicProduct | null>(null);
  const [paying, setPaying] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [done, setDone] = useState<{ number: string; change: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const density = usePref("sf-pos-density", "photos") === "compact" ? "compact" : "photos";
  const searchRef = useRef<HTMLInputElement>(null);
  /** Typed before a tap: "3" then a coffee rings up three coffees. */
  const [mult, setMult] = useState("");
  const terminalReady = useCardTerminal();
  const [card, setCard] = useState<{ phase: "waiting" } | { phase: "failed"; result: TerminalResult } | null>(
    null,
  );
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  // Till keyboard: "/" search, digits a quantity, Enter to charge, Delete the last line, Esc clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids =
      category === "all"
        ? menu.categories.flatMap((c) => c.productIds)
        : (menu.categories.find((c) => c.id === category)?.productIds ?? []);
    const f = fold(q);
    return ids.map((id) => menu.products[id]!).filter((p) => !q || fold(p.name).includes(f));
  }, [menu, category, query]);

  const subtotal = lines.reduce(
    (s, l) => s + unitPrice(forChannel(l.product, channel), l.optionValueIds) * l.quantity,
    0,
  );
  const manualCents = Math.round(subtotal * (discount / 100));
  const afterManual = subtotal - manualCents;
  const couponCents = coupon && afterManual >= coupon.minOrderCents ? couponDiscount(coupon, afterManual) : 0;
  const member = club && club.phone === normalizeIranMobile(phone) ? club : null;
  const redeemable =
    member?.customer && member.enabled && member.pointValueCents > 0
      ? Math.min(member.customer.points, Math.floor((afterManual - couponCents) / member.pointValueCents))
      : 0;
  const pointsUsed = usePoints ? redeemable : 0;
  const pointsCents = pointsUsed * (member?.pointValueCents ?? 0);
  const discountCents = manualCents + couponCents + pointsCents;
  const zone = channel === "delivery" ? zones.find((z) => z.id === zoneId) : undefined;
  const feeCents = zone?.feeCents ?? 0;
  const total = subtotal - discountCents + feeCents;

  // The caller's file (points, credit, last address) for a prefilled number.
  useEffect(() => {
    const n = initialPhone ? normalizeIranMobile(initialPhone) : null;
    if (n) lookup(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function lookup(n: string) {
    void lookupCustomerAction(restaurantId, n).then((res) => {
      if (res?.ok && res.data) {
        setClub({ phone: n, ...res.data });
        const last = res.data.addresses[0];
        if (last) {
          setAddress((a) => a || last.address);
          if (last.zoneId) setZoneId(last.zoneId);
        }
      }
    });
  }
  const onPhone = (v: string) => {
    setPhone(v);
    setUsePoints(false);
    const n = normalizeIranMobile(v);
    if (!n || n === club?.phone) return;
    lookup(n);
  };
  const applyCoupon = () =>
    start(async () => {
      setCouponError(null);
      const res = await checkCouponAction(restaurantId, couponInput);
      if (res?.ok && res.data) {
        setCoupon(res.data);
        setCouponInput("");
      } else setCouponError(tErr("coupon_invalid"));
    });
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  const add = (p: PublicProduct, optionValueIds: string[] = []) => {
    const n = Math.min(99, Math.max(1, Number(mult) || 1));
    setMult("");
    setDone(null);
    setLines((ls) => {
      const same = ls.find(
        (l) =>
          l.product.id === p.id && l.optionValueIds.join() === [...optionValueIds].sort().join() && !l.note,
      );
      if (same) return ls.map((l) => (l === same ? { ...l, quantity: Math.min(99, l.quantity + n) } : l));
      return [
        ...ls,
        { key: newKey(), product: p, optionValueIds: [...optionValueIds].sort(), quantity: n, note: "" },
      ];
    });
  };
  const tap = (p: PublicProduct) => {
    if (!p.isAvailable) return;
    if (p.optionGroups.length) setPicking(p);
    else add(p);
  };
  const setQty = (key: string, q: number) =>
    setLines((ls) =>
      q <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, quantity: q } : l)),
    );

  const submit = (payment: Payment | null) =>
    start(async () => {
      setError(null);
      const res = await createPosOrderAction(restaurantId, {
        channel,
        tableId: channel === "dine_in" && tableId ? tableId : null,
        deliveryAddress: channel === "delivery" ? address : "",
        deliveryZoneId: channel === "delivery" && zoneId ? zoneId : null,
        lines: lines.map((l) => ({
          productId: l.product.id,
          optionValueIds: l.optionValueIds,
          quantity: l.quantity,
          note: l.note,
        })),
        note,
        customerPhone: phone,
        customerName,
        discountPct: discount,
        couponCode: coupon?.code ?? "",
        redeemPoints: pointsUsed,
        payment,
        idempotencyKey: newKey(),
      });
      if (res?.ok && res.data) {
        setDone({
          number: res.data.number,
          change: payment?.tenderedCents != null ? payment.tenderedCents - res.data.totalCents : null,
        });
        setLines([]);
        setPhone("");
        setAddress("");
        setNote("");
        setDiscount(0);
        setClub(null);
        setCustomerName("");
        setUsePoints(false);
        setCoupon(null);
        setPaying(false);
        setTicketOpen(false);
        setCard(null);
      } else if (res && !res.ok) {
        setCard(null);
        setError(tErr.has(res.error) ? tErr(res.error) : tErr("internal"));
      }
    });

  /** Card: the amount goes to the terminal, the customer pays there, the sale is recorded. */
  const chargeCard = async () => {
    const bridge = terminalBridge();
    if (!bridge || !terminalReady) return submit({ provider: "on_site_terminal", tenderedCents: null });
    setPaying(false);
    setError(null);
    setCard({ phase: "waiting" });
    const result = await bridge
      .pay({ amountCents: total, currency, reference: newKey().slice(0, 12) })
      .catch((): TerminalResult => ({ status: "error", message: "bridge" }));
    if (result.status === "approved")
      submit({ provider: "on_site_terminal", tenderedCents: null, terminalRef: result.rrn ?? undefined });
    else setCard({ phase: "failed", result });
  };
  const pay = (payment: Payment) =>
    payment.provider === "on_site_terminal" && terminalReady ? void chargeCard() : submit(payment);

  const onKeys = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (/input|textarea|select/i.test(el.tagName) || el.isContentEditable) return;
    if (picking || card) return;
    if (e.key === "/") {
      e.preventDefault();
      searchRef.current?.focus();
    } else if (/^[0-9]$/.test(e.key) && !paying) {
      setMult((m) => (m + e.key).replace(/^0+/, "").slice(0, 2));
    } else if (e.key === "Escape") {
      if (paying) setPaying(false);
      else setMult("");
    } else if (e.key === "Enter" && !paying && lines.length && canPay && methods.length && !pending) {
      e.preventDefault();
      setPaying(true);
    } else if ((e.key === "Delete" || e.key === "Backspace") && !paying && lines.length) {
      if (mult) setMult((m) => m.slice(0, -1));
      else setLines((ls) => ls.slice(0, -1));
    }
  };
  useEffect(() => {
    keys.current = onKeys;
  });

  // The customer display (second screen) follows the ticket.
  const display = useRef<ReturnType<typeof makeDisplayPublisher> | null>(null);
  useEffect(() => {
    display.current = makeDisplayPublisher(restaurantId);
    return () => display.current?.close();
  }, [restaurantId]);
  useEffect(() => {
    display.current?.send({
      status: card ? "card" : paying ? "paying" : lines.length ? "cart" : done ? "paid" : "idle",
      lines: lines.map((l) => ({
        name: l.product.name,
        quantity: l.quantity,
        totalCents: unitPrice(forChannel(l.product, channel), l.optionValueIds) * l.quantity,
      })),
      discountCents,
      totalCents: lines.length ? total : 0,
      changeCents: done?.change ?? null,
      number: done?.number ?? null,
    });
  }, [lines, total, discountCents, paying, card, done, channel]);

  const ticket = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {(["takeaway", "dine_in", "delivery"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChannel(c)}
            className={cn(
              "flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold",
              channel === c ? "bg-surface text-fg shadow-sm" : "text-fg-muted",
            )}
          >
            {c === "takeaway" ? (
              <ShoppingBag className="size-4" />
            ) : c === "delivery" ? (
              <Bike className="size-4" />
            ) : (
              <UtensilsCrossed className="size-4" />
            )}
            {t(`channels.${c}`)}
          </button>
        ))}
      </div>
      {channel === "dine_in" ? (
        <select
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          className="mt-2 h-10 rounded-xl border border-border-strong bg-surface px-3 text-sm"
          aria-label={t("table")}
        >
          <option value="">{t("noTable")}</option>
          {tables.map((tb) => (
            <option key={tb.id} value={tb.id}>
              {t(tb.kind === "room" ? "tableNRoom" : "tableN", { label: tb.label })}
            </option>
          ))}
        </select>
      ) : null}
      {channel === "delivery" ? (
        <div className="mt-2 space-y-2 rounded-xl border border-tone-sky/30 bg-tone-sky/5 p-2">
          {member?.addresses.length ? (
            <div className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto">
              {member.addresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAddress(a.address);
                    if (a.zoneId) setZoneId(a.zoneId);
                  }}
                  className={cn(
                    "inline-flex max-w-48 shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs",
                    address === a.address ? "bg-tone-sky text-white" : "bg-surface ring-1 ring-border",
                  )}
                >
                  <MapPin className="size-3 shrink-0" />
                  <span className="truncate">{a.label ?? a.address}</span>
                </button>
              ))}
            </div>
          ) : null}
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t("deliveryAddress")}
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
          {zones.length ? (
            <select
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm"
              aria-label={t("zone")}
            >
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} · {money(z.feeCents)}
                </option>
              ))}
            </select>
          ) : null}
          {!phone ? <p className="text-xs text-warning">{t("deliveryNeedsPhone")}</p> : null}
        </div>
      ) : null}

      <ul className="mt-3 min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {lines.length === 0 ? (
          <li className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-sm text-fg-subtle">
            <ShoppingBag className="size-8" aria-hidden="true" />
            {done ? (
              <span className="rounded-xl bg-accent-soft px-4 py-3 text-accent-text">
                <span className="block font-bold">{t("sent", { number: done.number })}</span>
                {done.change != null && done.change > 0 ? (
                  <span className="block">{t("changeDue", { amount: money(done.change) })}</span>
                ) : null}
              </span>
            ) : (
              t("emptyTicket")
            )}
          </li>
        ) : (
          lines.map((l) => {
            const opts = l.product.optionGroups
              .flatMap((g) => g.values)
              .filter((v) => l.optionValueIds.includes(v.id));
            return (
              <li key={l.key} className="py-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{l.product.name}</p>
                    {opts.length ? (
                      <p className="truncate text-xs text-fg-muted">{opts.map((o) => o.name).join(" · ")}</p>
                    ) : null}
                    <input
                      value={l.note}
                      onChange={(e) =>
                        setLines((ls) =>
                          ls.map((x) => (x.key === l.key ? { ...x, note: e.target.value } : x)),
                        )
                      }
                      placeholder={t("lineNote")}
                      maxLength={280}
                      className="mt-1 h-7 w-full rounded-md bg-transparent text-xs text-fg-muted placeholder:text-fg-subtle focus:bg-surface-2 focus:outline-none"
                    />
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {money(unitPrice(forChannel(l.product, channel), l.optionValueIds) * l.quantity)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQty(l.key, l.quantity - 1)}
                    className="grid size-8 place-items-center rounded-lg bg-surface-2"
                    aria-label={t("less")}
                  >
                    {l.quantity === 1 ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}
                  </button>
                  <span className="w-7 text-center text-sm font-bold tabular-nums">{l.quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQty(l.key, Math.min(99, l.quantity + 1))}
                    className="grid size-8 place-items-center rounded-lg bg-surface-2"
                    aria-label={t("more")}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Smartphone className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              value={phone}
              onChange={(e) => onPhone(e.target.value)}
              inputMode="tel"
              dir="ltr"
              placeholder={t("phone")}
              className="h-9 w-full rounded-lg border border-border bg-surface ps-8 pe-2 text-sm"
            />
          </label>
          <label className="relative w-24">
            <Percent className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              type="number"
              min={0}
              max={100}
              value={discount || ""}
              onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              placeholder={t("discount")}
              className="h-9 w-full rounded-lg border border-border bg-surface ps-7 pe-2 text-sm"
            />
          </label>
        </div>
        {member?.customer ? (
          <div className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm">
            <Star className="size-4 shrink-0 fill-warning text-warning" />
            <span className="min-w-0 flex-1 truncate">
              <b>{member.customer.name ?? t("member")}</b> ·{" "}
              {t("pointsBalance", { points: member.customer.points })}
            </span>
            {redeemable > 0 ? (
              <button
                type="button"
                onClick={() => setUsePoints((u) => !u)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                  usePoints ? "bg-warning text-white" : "bg-surface ring-1 ring-warning/40",
                )}
              >
                {t("usePoints", { points: redeemable })}
              </button>
            ) : null}
          </div>
        ) : member ? (
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder={t("newCustomerName")}
            maxLength={120}
            className="h-9 w-full rounded-lg border border-dashed border-border-strong bg-surface px-3 text-sm"
          />
        ) : null}
        {coupon ? (
          <div className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm">
            <Ticket className="size-4 shrink-0 text-accent" />
            <span dir="ltr" className="font-mono font-bold">
              {coupon.code}
            </span>
            {afterManual < coupon.minOrderCents ? (
              <span className="text-xs text-danger">
                {t("couponMin", { amount: money(coupon.minOrderCents) })}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setCoupon(null)}
              className="ms-auto grid size-6 place-items-center rounded-full hover:bg-surface"
              aria-label={t("removeCoupon")}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <label className="relative flex-1">
              <Ticket className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <input
                value={couponInput}
                onChange={(e) => (setCouponInput(e.target.value.toUpperCase()), setCouponError(null))}
                onKeyDown={(e) => e.key === "Enter" && couponInput.length >= 3 && applyCoupon()}
                dir="ltr"
                placeholder={t("couponCode")}
                className="h-9 w-full rounded-lg border border-border bg-surface ps-8 pe-2 font-mono text-sm"
              />
            </label>
            <button
              type="button"
              disabled={couponInput.length < 3 || pending}
              onClick={applyCoupon}
              className="h-9 shrink-0 rounded-lg px-3 text-sm font-semibold ring-1 ring-border disabled:opacity-50"
            >
              {t("applyCoupon")}
            </button>
          </div>
        )}
        {couponError ? <p className="text-xs text-danger">{couponError}</p> : null}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("orderNote")}
          maxLength={500}
          className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm"
        />
        <dl className="space-y-1 pt-1 text-sm">
          {discountCents ? (
            <>
              <div className="flex justify-between text-fg-muted">
                <dt>{t("subtotal")}</dt>
                <dd className="tabular-nums">{money(subtotal)}</dd>
              </div>
              {manualCents ? (
                <div className="flex justify-between text-accent-text">
                  <dt>{t("discountLine", { pct: discount })}</dt>
                  <dd className="tabular-nums">−{money(manualCents)}</dd>
                </div>
              ) : null}
              {couponCents ? (
                <div className="flex justify-between text-accent-text">
                  <dt>{t("couponLine", { code: coupon!.code })}</dt>
                  <dd className="tabular-nums">−{money(couponCents)}</dd>
                </div>
              ) : null}
              {pointsCents ? (
                <div className="flex justify-between text-warning">
                  <dt>{t("pointsLine", { points: pointsUsed })}</dt>
                  <dd className="tabular-nums">−{money(pointsCents)}</dd>
                </div>
              ) : null}
            </>
          ) : null}
          {feeCents ? (
            <div className="flex justify-between text-tone-sky">
              <dt>{t("deliveryFee")}</dt>
              <dd className="tabular-nums">+{money(feeCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-lg font-bold">
            <dt>{t("total")}</dt>
            <dd className="tabular-nums">{money(total)}</dd>
          </div>
        </dl>
        {error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!lines.length || pending}
            onClick={() => submit(null)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 font-semibold ring-1 ring-border disabled:opacity-40"
          >
            <ChefHat className="size-5" aria-hidden="true" />
            {t("toKitchen")}
          </button>
          <button
            type="button"
            disabled={!lines.length || pending || !canPay || methods.length === 0}
            onClick={() => setPaying(true)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-40"
          >
            <Banknote className="size-5" aria-hidden="true" />
            {t("charge")}
          </button>
        </div>
        {/* One tap: exact cash, or the amount straight to the card terminal. */}
        {canPay && lines.length ? (
          <div className="grid grid-cols-2 gap-2">
            {methods.includes("cash") ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => submit({ provider: "cash", tenderedCents: total })}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-success-soft text-sm font-bold text-success ring-1 ring-success/25 disabled:opacity-40"
              >
                <Zap className="size-4" aria-hidden="true" />
                {t("quickCash")}
              </button>
            ) : null}
            {methods.includes("on_site_terminal") ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => pay({ provider: "on_site_terminal", tenderedCents: null })}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-tone-indigo/10 text-sm font-bold text-tone-indigo ring-1 ring-tone-indigo/25 disabled:opacity-40"
              >
                <CreditCard className="size-4" aria-hidden="true" />
                {terminalReady ? t("quickCardTerminal") : t("quickCard")}
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="hidden text-center text-[11px] text-fg-subtle lg:block">{t("keysHint")}</p>
      </div>
    </div>
  );

  return (
    <div className="grid min-h-0 gap-4 lg:h-[calc(100dvh-12rem)] lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex min-h-0 flex-col">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              className="h-11 w-full rounded-xl border border-border bg-surface ps-9 pe-9"
            />
            <kbd className="pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 text-[11px] text-fg-subtle lg:block">
              /
            </kbd>
          </label>
          {mult ? (
            <button
              type="button"
              onClick={() => setMult("")}
              aria-label={t("multiplierClear")}
              className="animate-pop-in flex h-11 shrink-0 items-center gap-1 rounded-xl bg-ink px-3 text-lg font-black text-ink-fg tabular-nums"
            >
              ×{mult}
              <X className="size-4 opacity-70" aria-hidden="true" />
            </button>
          ) : null}
          <a
            href={`/display/${restaurantId}`}
            target="sf-customer-display"
            title={t("customerDisplay")}
            aria-label={t("customerDisplay")}
            className="hidden size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-fg-muted hover:text-fg lg:grid"
          >
            <MonitorSmartphone className="size-5" aria-hidden="true" />
          </a>
          <div className="flex shrink-0 rounded-xl border border-border bg-surface p-1" role="group">
            {(["photos", "compact"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => writePref("sf-pos-density", d)}
                aria-pressed={density === d}
                aria-label={t(d === "photos" ? "densityPhotos" : "densityCompact")}
                title={t(d === "photos" ? "densityPhotos" : "densityCompact")}
                className={cn(
                  "grid size-9 place-items-center rounded-lg",
                  density === d ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
                )}
              >
                {d === "photos" ? (
                  <LayoutGrid className="size-4" aria-hidden="true" />
                ) : (
                  <Rows3 className="size-4" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-4 mt-3 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold",
              category === "all" ? "bg-accent text-accent-fg" : "bg-surface ring-1 ring-border",
            )}
          >
            {t("all")}
          </button>
          {menu.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap",
                category === c.id ? "bg-accent text-accent-fg" : "bg-surface ring-1 ring-border",
              )}
            >
              <CategoryIcon icon={c.icon} className="size-4" />
              {c.name}
            </button>
          ))}
        </div>
        <div
          className={cn(
            "mt-3 grid min-h-0 flex-1 auto-rows-max gap-3 overflow-y-auto pb-24 lg:pb-2",
            density === "compact"
              ? "grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
              : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4",
          )}
        >
          {products.map((p) => {
            const inTicket = lines.filter((l) => l.product.id === p.id).reduce((s, l) => s + l.quantity, 0);
            if (density === "compact")
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => tap(p)}
                  disabled={!p.isAvailable}
                  className={cn(
                    "relative flex min-h-20 flex-col justify-between rounded-xl border bg-surface p-3 text-start shadow-[var(--shadow-soft)] transition-transform active:scale-[0.97] disabled:opacity-45",
                    inTicket ? "border-accent ring-2 ring-accent/20" : "border-border",
                  )}
                >
                  <span className="line-clamp-2 text-sm leading-5 font-semibold">{p.name}</span>
                  <span className="mt-1 text-sm font-bold text-accent-text tabular-nums">
                    {money(forChannel(p, channel).priceCents)}
                  </span>
                  {inTicket ? (
                    <span className="absolute end-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-xs font-bold text-accent-fg tabular-nums">
                      {inTicket}
                    </span>
                  ) : null}
                </button>
              );
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => tap(p)}
                disabled={!p.isAvailable}
                className="group overflow-hidden rounded-2xl border border-border bg-surface text-start shadow-[var(--shadow-soft)] transition-transform active:scale-[0.97] disabled:opacity-45"
              >
                <span className="relative block aspect-[4/3] bg-surface-2">
                  {p.images[0] ? (
                    <img src={p.images[0].sm} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center text-fg-subtle">
                      <ImageIcon className="size-6" />
                    </span>
                  )}
                  {lines.some((l) => l.product.id === p.id) ? (
                    <span className="absolute end-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-xs font-bold text-accent-fg tabular-nums">
                      {lines.filter((l) => l.product.id === p.id).reduce((s, l) => s + l.quantity, 0)}
                    </span>
                  ) : null}
                </span>
                <span className="block p-2.5">
                  <span className="line-clamp-1 text-sm font-semibold">{p.name}</span>
                  <span className="mt-0.5 block text-sm font-bold text-accent-text tabular-nums">
                    {money(forChannel(p, channel).priceCents)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="hidden min-h-0 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)] lg:block">
        {ticket}
      </aside>

      {/* Mobile: ticket in a bottom sheet */}
      <button
        type="button"
        onClick={() => setTicketOpen(true)}
        className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex h-14 items-center justify-between rounded-2xl bg-accent px-5 font-bold text-accent-fg shadow-[var(--shadow-float)] lg:hidden"
      >
        <span className="flex items-center gap-2">
          <ShoppingBag className="size-5" />
          {t("ticket", { count })}
        </span>
        <span className="tabular-nums">{money(total)}</span>
      </button>
      {ticketOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={t("close")}
            className="absolute inset-0 bg-black/30"
            onClick={() => setTicketOpen(false)}
          />
          <div className="animate-sheet-up absolute inset-x-0 bottom-0 flex h-[85dvh] flex-col rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setTicketOpen(false)}
                className="grid size-9 place-items-center rounded-full bg-surface-2"
                aria-label={t("close")}
              >
                <X className="size-4" />
              </button>
            </div>
            {ticket}
          </div>
        </div>
      ) : null}

      {picking ? (
        <OptionPicker
          product={picking}
          money={money}
          onClose={() => setPicking(null)}
          onAdd={(ids) => (add(picking, ids), setPicking(null))}
        />
      ) : null}
      {paying ? (
        <PayDialog
          total={total}
          currency={currency}
          methods={methods}
          account={
            member?.customer?.creditLimitCents != null
              ? {
                  available: member.customer.creditLimitCents - member.customer.balanceCents,
                  balance: member.customer.balanceCents,
                }
              : null
          }
          pending={pending}
          onClose={() => setPaying(false)}
          terminalReady={terminalReady}
          onPay={(provider, tendered) => pay({ provider, tenderedCents: tendered })}
        />
      ) : null}
      {card ? (
        <CardWaiting
          total={total}
          currency={currency}
          state={card}
          pending={pending}
          onCancel={() => {
            void terminalBridge()?.cancel();
            setCard(null);
          }}
          onRetry={() => void chargeCard()}
          onManual={() => submit({ provider: "on_site_terminal", tenderedCents: null })}
        />
      ) : null}
    </div>
  );
}

export function OptionPicker({
  product,
  money,
  onClose,
  onAdd,
}: {
  product: PublicProduct;
  money: (c: number) => string;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const t = useTranslations("pos");
  const [sel, setSel] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      product.optionGroups.map((g) => [
        g.id,
        g.values
          .filter((v) => v.isDefault && v.isAvailable)
          .slice(0, g.maxSelect)
          .map((v) => v.id),
      ]),
    ),
  );
  const ok = product.optionGroups.every((g) => (sel[g.id]?.length ?? 0) >= g.minSelect);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("close")}
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="animate-sheet-up relative max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 sm:max-w-md sm:rounded-3xl">
        <p className="text-lg font-bold">{product.name}</p>
        {product.optionGroups.map((g) => (
          <fieldset key={g.id} className="mt-4">
            <legend className="text-sm font-semibold">
              {g.name}
              {g.minSelect > 0 ? <span className="ms-2 text-xs text-danger">*</span> : null}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {g.values.map((v) => {
                const on = sel[g.id]?.includes(v.id) ?? false;
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={!v.isAvailable}
                    onClick={() =>
                      setSel((s) => {
                        const cur = s[g.id] ?? [];
                        if (on) return { ...s, [g.id]: cur.filter((x) => x !== v.id) };
                        if (g.maxSelect === 1) return { ...s, [g.id]: [v.id] };
                        return cur.length >= g.maxSelect ? s : { ...s, [g.id]: [...cur, v.id] };
                      })
                    }
                    className={cn(
                      "rounded-xl px-3 py-2 text-sm ring-1 disabled:opacity-40",
                      on ? "bg-accent-soft font-semibold text-accent-text ring-accent" : "ring-border",
                    )}
                  >
                    {on ? <Check className="me-1 inline size-3.5" /> : null}
                    {v.name}
                    {v.priceDeltaCents ? (
                      <span className="ms-1 text-xs opacity-70">+{money(v.priceDeltaCents)}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={!ok}
          onClick={() => onAdd(Object.values(sel).flat())}
          className="mt-6 h-12 w-full rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-40"
        >
          {t("addToTicket")}
        </button>
      </div>
    </div>
  );
}

function PayDialog({
  total,
  currency,
  methods,
  account,
  pending,
  terminalReady,
  onClose,
  onPay,
}: {
  total: number;
  currency: string;
  terminalReady: boolean;
  methods: ("cash" | "on_site_terminal")[];
  /** The customer has a house account: what is left on their credit. */
  account: { available: number; balance: number } | null;
  pending: boolean;
  onClose: () => void;
  onPay: (provider: "cash" | "on_site_terminal" | "account", tendered: number | null) => void;
}) {
  const t = useTranslations("pos");
  const money = useMoney(currency);
  const all = [...methods, ...(account ? (["account"] as const) : [])];
  const [method, setMethod] = useState<(typeof all)[number]>(all[0]!);
  const [tendered, setTendered] = useState("");
  const tenderedCents = tendered ? parseMoneyInput(tendered, currency) : null;
  const unit = currency === "IRR" ? 1000 : 100;
  const step = currency === "IRR" ? 50_000_000 : 1000; // round-ups: 50,000 toman / 10 €
  const quick = [total, Math.ceil(total / step) * step, Math.ceil(total / step) * step + step].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  const change = tenderedCents != null ? tenderedCents - total : null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("close")}
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="animate-sheet-up relative w-full rounded-t-3xl bg-surface p-5 sm:max-w-md sm:rounded-3xl">
        <p className="text-sm text-fg-muted">{t("toPay")}</p>
        <p className="text-3xl font-bold tabular-nums">{money(total)}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {all.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={cn(
                "flex h-14 items-center justify-center gap-2 rounded-xl font-semibold ring-1",
                method === m ? "bg-accent-soft text-accent-text ring-accent" : "ring-border",
              )}
            >
              {m === "cash" ? (
                <Banknote className="size-5" />
              ) : m === "account" ? (
                <BookUser className="size-5" />
              ) : (
                <CreditCard className="size-5" />
              )}
              {t(`methods.${m}`)}
            </button>
          ))}
        </div>
        {method === "account" && account ? (
          <p
            className={cn(
              "mt-4 rounded-xl px-4 py-3 text-sm",
              account.available >= total
                ? "bg-tone-indigo/10 text-tone-indigo"
                : "bg-danger-soft text-danger",
            )}
          >
            {t("accountInfo", { balance: money(account.balance), available: money(account.available) })}
          </p>
        ) : null}
        {method === "cash" ? (
          <div className="mt-4">
            <label className="text-sm font-medium" htmlFor="tendered">
              {t("tendered")}
            </label>
            <input
              id="tendered"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              placeholder={String(total / unit)}
              className="mt-1 h-12 w-full rounded-xl border border-border-strong px-3 text-lg tabular-nums"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {quick.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTendered(String(v / unit))}
                  className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium tabular-nums"
                >
                  {money(v)}
                </button>
              ))}
            </div>
            {change != null ? (
              <p
                className={cn(
                  "mt-3 rounded-xl px-4 py-3 text-lg font-bold",
                  change >= 0 ? "bg-accent-soft text-accent-text" : "bg-danger-soft text-danger",
                )}
              >
                {change >= 0
                  ? t("changeDue", { amount: money(change) })
                  : t("missing", { amount: money(-change) })}
              </p>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          disabled={pending || (method === "cash" && change != null && change < 0)}
          onClick={() => onPay(method, method === "cash" ? tenderedCents : null)}
          className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-lg font-bold text-accent-fg disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : method === "on_site_terminal" && terminalReady ? (
            <CreditCard className="size-5" />
          ) : (
            <Check className="size-5" />
          )}
          {method === "on_site_terminal" && terminalReady ? t("sendToTerminal") : t("confirmPayment")}
        </button>
        {method === "on_site_terminal" && !terminalReady ? (
          <p className="mt-2 text-center text-xs text-fg-muted">{t("terminalManualHint")}</p>
        ) : null}
      </div>
    </div>
  );
}

/** While the customer pays on the card terminal: the amount, then the result. */
function CardWaiting({
  total,
  currency,
  state,
  pending,
  onCancel,
  onRetry,
  onManual,
}: {
  total: number;
  currency: string;
  state: { phase: "waiting" } | { phase: "failed"; result: TerminalResult };
  pending: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onManual: () => void;
}) {
  const t = useTranslations("pos");
  const money = useMoney(currency);
  const failed = state.phase === "failed";
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4"
      role="alertdialog"
      aria-modal="true"
    >
      <div className="animate-pop-in w-full max-w-sm rounded-3xl bg-surface p-6 text-center">
        <span
          className={cn(
            "mx-auto grid size-16 place-items-center rounded-full",
            failed ? "bg-danger-soft text-danger" : "bg-tone-indigo/12 text-tone-indigo",
          )}
        >
          {failed ? (
            <X className="size-8" aria-hidden="true" />
          ) : pending ? (
            <Loader2 className="size-8 animate-spin" aria-hidden="true" />
          ) : (
            <CreditCard className="size-8 animate-pulse" aria-hidden="true" />
          )}
        </span>
        <p className="mt-4 text-3xl font-black tabular-nums">{money(total)}</p>
        <p className="mt-2 text-sm text-fg-muted" role="status">
          {failed ? t(`terminal.${state.result.status}`) : t("terminal.waiting")}
        </p>
        <div className="mt-5 grid gap-2">
          {failed ? (
            <>
              <button
                type="button"
                onClick={onRetry}
                className="h-12 rounded-xl bg-accent font-bold text-accent-fg"
              >
                {t("terminal.retry")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onManual}
                className="h-11 rounded-xl text-sm font-semibold ring-1 ring-border"
              >
                {t("terminal.paidAnyway")}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-xl text-sm font-semibold text-fg-muted"
          >
            {t("terminal.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
