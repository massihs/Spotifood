"use client";

import { Building2, Minus, Plus, Search, Truck, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Sheet, useRun } from "@/components/ui/sheet-kit";
import { FormError, Label, inputCls } from "@/components/ui/form-kit";
import { DateInput } from "@/components/ui/date-input";
import { useMoney } from "@/components/ui/use-money";
import { Link } from "@/i18n/navigation";
import { forTrade } from "@/lib/channel-price";
import { cn } from "@/lib/cn";
import { centsToInput, parseMoneyInput, unitLabel } from "@/lib/money";
import {
  createTradeOrderAction,
  receiveTradePaymentAction,
  removeTradeCustomerAction,
  saveTradeCustomerAction,
} from "./actions";

export type TradeCustomerView = {
  id: string;
  phone: string;
  name: string | null;
  taxId: string | null;
  address: string | null;
  note: string | null;
  creditLimitCents: number | null;
  balanceCents: number;
  paymentTermsDays: number;
  tradeDiscountBps: number;
  overdue: boolean;
  oldestDebtDays: number | null;
};
export type TradeProductView = {
  id: string;
  name: string;
  categoryName: string;
  priceCents: number;
  tradePriceCents: number | null;
  isAvailable: boolean;
  image: string | null;
};

const newKey = () => crypto.randomUUID().replace(/-/g, "");

/** Search folding for Persian/Arabic letter variants and case. */
const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .toLowerCase();

/**
 * The trade order desk: pick the professional customer, tap the products (quantities can be
 * typed: 24 bags, 5 kg…), see the total at their trade prices, choose how it is paid.
 */
export function TradeOrderDesk({
  restaurantId,
  currency,
  customers,
  products,
}: {
  restaurantId: string;
  currency: string;
  customers: TradeCustomerView[];
  products: TradeProductView[];
}) {
  const t = useTranslations("b2b");
  const money = useMoney(currency);
  const { pending, error, run } = useRun();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState<"account" | "cash" | "on_site_terminal" | null>("account");
  const [delivery, setDelivery] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<{ number: string; totalCents: number } | null>(null);
  const [key, setKey] = useState(newKey);
  const customer = customers.find((c) => c.id === customerId) ?? null;
  const bps = customer?.tradeDiscountBps ?? 0;
  const unit = (p: TradeProductView) => forTrade(p, bps).priceCents;
  const lines = products.filter((p) => (qty[p.id] ?? 0) > 0);
  const total = lines.reduce((s, p) => s + unit(p) * qty[p.id]!, 0);
  const hasAccount = customer?.creditLimitCents != null;
  const room = hasAccount ? customer!.creditLimitCents! - customer!.balanceCents : 0;
  const method = payment === "account" && !hasAccount ? null : payment;
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return products.filter((p) => !q || fold(`${p.name} ${p.categoryName}`).includes(q));
  }, [products, query]);
  const set = (id: string, n: number) => setQty((m) => ({ ...m, [id]: Math.max(0, Math.min(9999, n)) }));

  if (!customers.length)
    return (
      <div className="rounded-2xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-fg-muted">
        {t("noCustomersYet")}
      </div>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="min-w-0 space-y-3">
        <label className="relative block">
          <span className="sr-only">{t("search")}</span>
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            className={cn(inputCls, "ps-10")}
          />
        </label>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => {
            const n = qty[p.id] ?? 0;
            const retail = p.priceCents;
            const price = unit(p);
            return (
              <li
                key={p.id}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border bg-surface p-2.5 transition-colors",
                  n ? "border-accent bg-accent-soft/30" : "border-border",
                  !p.isAvailable && "opacity-50",
                )}
              >
                {p.image ? (
                  <img src={p.image} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-subtle">
                    <Building2 className="size-5" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm leading-5 font-semibold">{p.name}</span>
                  <span className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                    <span className="text-xs text-fg-muted tabular-nums">
                      <b className="text-fg">{money(price)}</b>
                      {price < retail && !n ? <s className="ms-1.5 text-fg-subtle">{money(retail)}</s> : null}
                    </span>
                    <span className="ms-auto flex shrink-0 items-center gap-1">
                      {n ? (
                        <>
                          <button
                            type="button"
                            onClick={() => set(p.id, n - 1)}
                            aria-label={t("less", { name: p.name })}
                            className="grid size-9 place-items-center rounded-full bg-surface-2"
                          >
                            <Minus className="size-4" aria-hidden="true" />
                          </button>
                          <input
                            inputMode="numeric"
                            value={n}
                            onChange={(e) => set(p.id, Number(e.target.value.replace(/\D/g, "")) || 0)}
                            aria-label={t("quantity", { name: p.name })}
                            className="h-9 w-12 rounded-lg border border-border text-center text-sm font-bold tabular-nums"
                          />
                        </>
                      ) : null}
                      <button
                        type="button"
                        disabled={!p.isAvailable}
                        onClick={() => set(p.id, n + 1)}
                        aria-label={t("more", { name: p.name })}
                        className="grid size-9 place-items-center rounded-full bg-accent text-accent-fg disabled:opacity-40"
                      >
                        <Plus className="size-4" aria-hidden="true" />
                      </button>
                    </span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="space-y-4 rounded-2xl border border-border bg-surface p-4 lg:sticky lg:top-20 lg:self-start">
        <label className="block">
          <Label>{t("customer")}</Label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? c.phone}
              </option>
            ))}
          </select>
        </label>
        {customer ? (
          <p className="text-xs text-fg-muted">
            {bps ? t("discountLine", { pct: bps / 100 }) : t("tradePrices")}
            {hasAccount ? ` · ${t("accountRoom", { amount: money(Math.max(0, room)) })}` : ""}
            {customer.overdue ? (
              <span className="ms-1 font-semibold text-danger">· {t("overdue")}</span>
            ) : null}
          </p>
        ) : null}

        {lines.length ? (
          <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
            {lines.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  <b className="tabular-nums">{qty[p.id]}×</b> {p.name}
                </span>
                <span className="shrink-0 tabular-nums">{money(unit(p) * qty[p.id]!)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{t("emptyOrder")}</p>
        )}
        <p className="flex items-baseline justify-between border-t border-border pt-3 text-lg font-bold">
          <span>{t("total")}</span>
          <span className="tabular-nums">{money(total)}</span>
        </p>

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{t("payment")}</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {(["account", "cash", "on_site_terminal", null] as const).map((m) => (
              <button
                key={m ?? "later"}
                type="button"
                disabled={m === "account" && !hasAccount}
                aria-pressed={method === m}
                onClick={() => setPayment(m)}
                className={cn(
                  "h-11 rounded-xl px-2 text-sm font-semibold ring-1 transition-colors disabled:opacity-40",
                  method === m ? "bg-accent text-accent-fg ring-accent" : "ring-border hover:bg-surface-2",
                )}
              >
                {t(`pay.${m ?? "later"}`)}
              </button>
            ))}
          </div>
          {method === "account" && total > room ? (
            <p className="mt-1.5 text-xs font-semibold text-danger">{t("overLimit")}</p>
          ) : null}
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} />
          <Truck className="size-4 text-fg-muted" aria-hidden="true" />
          {t("deliver")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={t("notePlaceholder")}
          className={cn(inputCls, "h-auto py-2")}
        />
        <FormError error={error} />
        {done ? (
          <p
            className="rounded-xl bg-success-soft px-3 py-2 text-sm font-semibold text-success"
            role="status"
          >
            {t("done", { number: done.number, amount: money(done.totalCents) })}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending || !lines.length || !customer}
          onClick={() =>
            run(async () => {
              const res = await createTradeOrderAction(restaurantId, {
                customerId,
                lines: lines.map((p) => ({ productId: p.id, quantity: qty[p.id]! })),
                payment: method,
                delivery,
                note,
                idempotencyKey: key,
              });
              if (res?.ok && res.data) {
                setDone(res.data);
                setQty({});
                setNote("");
                setKey(newKey());
              }
              return res;
            })
          }
          className="h-12 w-full rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-50"
        >
          {pending ? t("sending") : t("submit")}
        </button>
      </aside>
    </div>
  );
}

/** Add or edit a professional customer. */
export function TradeCustomerSheet({
  restaurantId,
  currency,
  customer,
  onClose,
}: {
  restaurantId: string;
  currency: string;
  customer: TradeCustomerView | null;
  onClose: () => void;
}) {
  const t = useTranslations("b2b");
  const locale = useLocale();
  const { pending, error, run } = useRun();
  const [v, setV] = useState({
    phone: customer?.phone ?? "",
    name: customer?.name ?? "",
    taxId: customer?.taxId ?? "",
    address: customer?.address ?? "",
    note: customer?.note ?? "",
    account: customer ? customer.creditLimitCents != null : true,
    limit: centsToInput(customer?.creditLimitCents ?? null, locale, currency),
    terms: String(customer?.paymentTermsDays ?? 30),
    discount: String((customer?.tradeDiscountBps ?? 0) / 100),
  });
  const on = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Sheet title={customer ? (customer.name ?? customer.phone) : t("newCustomer")} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <Label>{t("form.name")}</Label>
          <input value={v.name} onChange={on("name")} className={inputCls} maxLength={120} autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>{t("form.phone")}</Label>
            <input
              value={v.phone}
              onChange={on("phone")}
              className={inputCls}
              inputMode="tel"
              dir="ltr"
              disabled={!!customer}
            />
          </label>
          <label className="block">
            <Label>{t("form.taxId")}</Label>
            <input
              value={v.taxId}
              onChange={on("taxId")}
              className={inputCls}
              inputMode="numeric"
              dir="ltr"
            />
          </label>
        </div>
        <label className="block">
          <Label>{t("form.address")}</Label>
          <textarea
            value={v.address}
            onChange={on("address")}
            rows={2}
            className={cn(inputCls, "h-auto py-2")}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label hint="%">{t("form.discount")}</Label>
            <input value={v.discount} onChange={on("discount")} className={inputCls} inputMode="decimal" />
          </label>
          <label className="block">
            <Label>{t("form.terms")}</Label>
            <input value={v.terms} onChange={on("terms")} className={inputCls} inputMode="numeric" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={v.account}
            onChange={(e) => setV((x) => ({ ...x, account: e.target.checked }))}
          />
          {t("form.account")}
        </label>
        {v.account ? (
          <label className="block">
            <Label hint={unitLabel(currency, locale)}>{t("form.limit")}</Label>
            <input value={v.limit} onChange={on("limit")} className={inputCls} inputMode="numeric" />
          </label>
        ) : null}
        <label className="block">
          <Label>{t("form.note")}</Label>
          <textarea value={v.note} onChange={on("note")} rows={2} className={cn(inputCls, "h-auto py-2")} />
        </label>
        <FormError error={error} />
        <div className="flex gap-2">
          {customer ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                window.confirm(t("removeConfirm")) &&
                run(() => removeTradeCustomerAction(restaurantId, customer.id), onClose)
              }
              className="h-11 rounded-xl px-3 text-sm font-semibold text-danger ring-1 ring-danger/30"
            >
              {t("remove")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending || v.name.trim().length < 2}
            onClick={() =>
              run(
                () =>
                  saveTradeCustomerAction(restaurantId, customer?.id ?? null, {
                    phone: v.phone,
                    name: v.name,
                    taxId: v.taxId,
                    address: v.address,
                    note: v.note,
                    creditLimitCents: v.account ? (parseMoneyInput(v.limit || "0", currency) ?? 0) : null,
                    paymentTermsDays: Number(v.terms) || 0,
                    discountPct: Number(v.discount.replace(",", ".")) || 0,
                  }),
                onClose,
              )
            }
            className="h-11 flex-1 rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-50"
          >
            {t("save")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** A professional customer settles their account (cash, card, transfer or cheque). */
export function TradePaymentSheet({
  restaurantId,
  currency,
  customer,
  onClose,
}: {
  restaurantId: string;
  currency: string;
  customer: TradeCustomerView;
  onClose: () => void;
}) {
  const t = useTranslations("b2b");
  const locale = useLocale();
  const money = useMoney(currency);
  const { pending, error, run } = useRun();
  const [amount, setAmount] = useState(centsToInput(customer.balanceCents, locale, currency));
  const [method, setMethod] = useState<"cash" | "card" | "transfer" | "cheque">("transfer");
  const [cheque, setCheque] = useState({ sayadId: "", number: "", bank: "", dueDate: "" });
  return (
    <Sheet title={t("receive", { name: customer.name ?? customer.phone })} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">{t("owes", { amount: money(customer.balanceCents) })}</p>
        <label className="block">
          <Label hint={unitLabel(currency, locale)}>{t("amount")}</Label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
            inputMode="numeric"
          />
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {(["cash", "card", "transfer", "cheque"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={method === m}
              onClick={() => setMethod(m)}
              className={cn(
                "h-10 rounded-xl text-sm font-semibold ring-1",
                method === m ? "bg-accent text-accent-fg ring-accent" : "ring-border",
              )}
            >
              {t(`method.${m}`)}
            </button>
          ))}
        </div>
        {method === "cheque" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 block">
              <Label>{t("cheque.sayad")}</Label>
              <input
                value={cheque.sayadId}
                onChange={(e) => setCheque((c) => ({ ...c, sayadId: e.target.value }))}
                className={inputCls}
                inputMode="numeric"
                dir="ltr"
              />
            </label>
            <label className="block">
              <Label>{t("cheque.number")}</Label>
              <input
                value={cheque.number}
                onChange={(e) => setCheque((c) => ({ ...c, number: e.target.value }))}
                className={inputCls}
              />
            </label>
            <label className="block">
              <Label>{t("cheque.bank")}</Label>
              <input
                value={cheque.bank}
                onChange={(e) => setCheque((c) => ({ ...c, bank: e.target.value }))}
                className={inputCls}
              />
            </label>
            <label className="col-span-2 block">
              <Label>{t("cheque.due")}</Label>
              <DateInput value={cheque.dueDate} onChange={(d) => setCheque((c) => ({ ...c, dueDate: d }))} />
            </label>
          </div>
        ) : null}
        <FormError error={error} />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                receiveTradePaymentAction(restaurantId, {
                  customerId: customer.id,
                  amountCents: parseMoneyInput(amount || "0", currency) ?? 0,
                  method,
                  ...(method === "cheque" ? { cheque } : {}),
                }),
              onClose,
            )
          }
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-50"
        >
          <Wallet className="size-4" aria-hidden="true" />
          {t("record")}
        </button>
      </div>
    </Sheet>
  );
}

/** The list of professional customers with what they owe; tap to edit or record a payment. */
export function TradeCustomers({
  restaurantId,
  currency,
  customers,
  canManage,
  canCollect,
}: {
  restaurantId: string;
  currency: string;
  customers: TradeCustomerView[];
  canManage: boolean;
  canCollect: boolean;
}) {
  const t = useTranslations("b2b");
  const money = useMoney(currency);
  const [edit, setEdit] = useState<TradeCustomerView | "new" | null>(null);
  const [pay, setPay] = useState<TradeCustomerView | null>(null);
  return (
    <section className="space-y-3">
      {canManage ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEdit("new")}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("newCustomer")}
          </button>
        </div>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {customers.map((c) => (
          <li key={c.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/${restaurantId}/customers/${c.id}`}
                  className="block truncate font-semibold hover:underline"
                >
                  {c.name ?? c.phone}
                </Link>
                <p className="truncate text-xs text-fg-muted" dir="ltr">
                  {c.phone}
                  {c.taxId ? ` · ${c.taxId}` : ""}
                </p>
              </div>
              {c.tradeDiscountBps ? (
                <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-text">
                  −{c.tradeDiscountBps / 100}%
                </span>
              ) : null}
            </div>
            <p className="mt-3 flex items-baseline justify-between text-sm">
              <span className="text-fg-muted">{t("balance")}</span>
              <span className={cn("font-bold tabular-nums", c.overdue && "text-danger")}>
                {money(c.balanceCents)}
              </span>
            </p>
            <p className="text-xs text-fg-subtle">
              {c.creditLimitCents != null
                ? t("limitTerms", { limit: money(c.creditLimitCents), days: c.paymentTermsDays })
                : t("noAccount")}
              {c.overdue ? ` · ${t("overdueDays", { days: c.oldestDebtDays ?? 0 })}` : ""}
            </p>
            <div className="mt-3 flex gap-2">
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setEdit(c)}
                  className="h-9 rounded-full px-3 text-sm font-semibold ring-1 ring-border hover:bg-surface-2"
                >
                  {t("edit")}
                </button>
              ) : null}
              {canCollect && c.balanceCents > 0 ? (
                <button
                  type="button"
                  onClick={() => setPay(c)}
                  className="h-9 rounded-full bg-ink px-3 text-sm font-semibold text-ink-fg"
                >
                  {t("collect")}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {!customers.length ? (
        <p className="rounded-2xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-fg-muted">
          {t("noCustomers")}
        </p>
      ) : null}
      {edit ? (
        <TradeCustomerSheet
          restaurantId={restaurantId}
          currency={currency}
          customer={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
        />
      ) : null}
      {pay ? (
        <TradePaymentSheet
          restaurantId={restaurantId}
          currency={currency}
          customer={pay}
          onClose={() => setPay(null)}
        />
      ) : null}
    </section>
  );
}
