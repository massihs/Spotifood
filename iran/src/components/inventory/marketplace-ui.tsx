"use client";

import { Minus, Plus, ShoppingCart, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { field, useRun } from "@/components/ui/sheet-kit";
import { useMoney } from "@/components/ui/use-money";
import { cn } from "@/lib/cn";
import { parseMoneyInput } from "@/lib/money";
import { placeMarketplaceOrderAction } from "@/app/[locale]/dashboard/[restaurantId]/inventory/actions";
import { saveListingAction } from "@/app/[locale]/dashboard/[restaurantId]/b2b/actions";

type Item = { id: string; name: string; category: string; priceCents: number };

const newKey = () => `mkt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

/** A supplier's catalogue with quantities, and the order button. */
export function SupplierOrder({
  rid,
  sellerId,
  items,
  currency,
  minOrderCents,
}: {
  rid: string;
  sellerId: string;
  items: Item[];
  currency: string;
  minOrderCents: number;
}) {
  const t = useTranslations("marketplace");
  const money = useMoney(currency);
  const { pending, error, run } = useRun();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [key, setKey] = useState(newKey);
  const [done, setDone] = useState<string | null>(null);
  const total = items.reduce((s, i) => s + (qty[i.id] ?? 0) * i.priceCents, 0);
  const groups = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const set = (id: string, q: number) => setQty({ ...qty, [id]: Math.max(0, Math.min(9999, q)) });
  const lines = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([productId, quantity]) => ({ productId, quantity }));
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g} className="rounded-2xl border border-border bg-surface">
          <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">{g}</p>
          <ul className="divide-y divide-border">
            {items
              .filter((i) => i.category === g)
              .map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.name}</span>
                  <span className="text-sm text-fg-muted tabular-nums">{money(i.priceCents)}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 p-1">
                    <button
                      type="button"
                      aria-label="−"
                      onClick={() => set(i.id, (qty[i.id] ?? 0) - 1)}
                      className="grid size-7 place-items-center rounded-full bg-surface"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <input
                      inputMode="numeric"
                      dir="ltr"
                      className="w-10 bg-transparent text-center text-sm font-bold tabular-nums"
                      value={qty[i.id] ?? 0}
                      onChange={(e) => set(i.id, Number(e.target.value) || 0)}
                    />
                    <button
                      type="button"
                      aria-label="+"
                      onClick={() => set(i.id, (qty[i.id] ?? 0) + 1)}
                      className="grid size-7 place-items-center rounded-full bg-surface"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
      <div className="sticky bottom-3 space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-float)]">
        <input
          className={field}
          placeholder={t("note")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {minOrderCents ? (
          <p className="text-xs text-fg-muted">{t("minimum", { amount: money(minOrderCents) })}</p>
        ) : null}
        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
        {done ? (
          <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
            {t("done", { number: done })}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending || !lines.length}
          onClick={() =>
            run(async () => {
              const r = await placeMarketplaceOrderAction(rid, sellerId, {
                lines,
                note,
                idempotencyKey: key,
              });
              if (r?.ok && r.data) {
                setDone(r.data.number);
                setQty({});
                setNote("");
                setKey(newKey());
              }
              return r;
            })
          }
          className="flex h-12 w-full items-center justify-between rounded-xl bg-accent px-5 font-bold text-accent-fg disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-2">
            <ShoppingCart className="size-5" />
            {t("order")}
          </span>
          <span className="tabular-nums">{money(total)}</span>
        </button>
      </div>
    </div>
  );
}

/** Selling on the marketplace: listed or not, a short pitch, a minimum order. */
export function ListingForm({
  rid,
  initial,
  currency,
  canManage,
}: {
  rid: string;
  initial: { listed: boolean; pitch: string; minOrderCents: number };
  currency: string;
  canManage: boolean;
}) {
  const t = useTranslations("marketplace.listing");
  const { pending, error, run } = useRun();
  const [listed, setListed] = useState(initial.listed);
  const [pitch, setPitch] = useState(initial.pitch);
  const [min, setMin] = useState(
    initial.minOrderCents ? String(initial.minOrderCents / (currency === "IRR" ? 1000 : 100)) : "",
  );
  const [saved, setSaved] = useState(false);
  return (
    <div className="max-w-2xl space-y-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
          <Store className="size-5" />
        </span>
        <div>
          <p className="font-semibold">{t("title")}</p>
          <p className="text-sm text-fg-muted">{t("hint")}</p>
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          className="size-5 accent-[var(--accent)]"
          checked={listed}
          disabled={!canManage}
          onChange={(e) => (setListed(e.target.checked), setSaved(false))}
        />
        {t("listed")}
      </label>
      <textarea
        rows={2}
        maxLength={300}
        className={cn(field, "h-auto py-2 text-sm")}
        placeholder={t("pitch")}
        value={pitch}
        disabled={!canManage}
        onChange={(e) => (setPitch(e.target.value), setSaved(false))}
      />
      <label className="block text-sm font-medium">
        {t("minimum")}
        <input
          inputMode="numeric"
          dir="ltr"
          className={cn(field, "mt-1 max-w-48")}
          value={min}
          disabled={!canManage}
          onChange={(e) => (setMin(e.target.value), setSaved(false))}
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {canManage ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                saveListingAction(rid, {
                  listed,
                  pitch,
                  minOrderCents: min.trim() ? (parseMoneyInput(min, currency) ?? 0) : 0,
                }),
              () => setSaved(true),
            )
          }
          className="h-11 rounded-xl bg-accent px-5 font-bold text-accent-fg disabled:opacity-50"
        >
          {saved ? "✓" : t("save")}
        </button>
      ) : null}
    </div>
  );
}
