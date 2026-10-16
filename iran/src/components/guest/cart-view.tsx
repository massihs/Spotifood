"use client";

import { ChevronLeft, Plus, ShoppingBag, UserRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useOptimistic, useState, useTransition } from "react";
import {
  placeOrderAction,
  removeItemAction,
  renameAction,
  setNoteAction,
  setQuantityAction,
} from "@/app/[locale]/table/actions";
import { useMoney } from "@/components/ui/use-money";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import type { CartLineView } from "@/server/modules/cart/service";
import type { Totals } from "@/server/modules/pricing";
import { QuantityStepper } from "./parts";

export function GuestTopBar({
  title,
  subtitle,
  extra,
}: {
  title: string;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const t = useTranslations("guest");
  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md supports-[backdrop-filter]:bg-bg/85">
      <Link
        href="/table"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 active:bg-surface-3"
        aria-label={t("backToMenu")}
      >
        <ChevronLeft className="size-5 ltr:rotate-0 rtl:rotate-180" aria-hidden="true" />
      </Link>
      <div className="min-w-0">
        <h1 className="truncate text-lg leading-tight font-semibold">{title}</h1>
        {subtitle ? <div className="truncate text-sm text-fg-muted">{subtitle}</div> : null}
      </div>
      {extra ? <div className="ms-auto shrink-0">{extra}</div> : null}
    </div>
  );
}

export function CartView({
  lines,
  totals,
  currency,
  pricesIncludeTax,
  seatLabel,
  displayName,
  hasIssues,
  orderCount,
  restaurantName,
}: {
  lines: CartLineView[];
  totals: Totals;
  currency: string;
  pricesIncludeTax: boolean;
  seatLabel: string;
  displayName: string | null;
  hasIssues: boolean;
  orderCount: number;
  restaurantName?: string;
}) {
  const t = useTranslations();
  const money = useMoney(currency);
  const format = useFormatter();
  const rate = (bps: number) => format.number(bps / 10_000, { style: "percent", maximumFractionDigits: 2 });
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <>
      <GuestTopBar
        title={t("guest.cartTitle")}
        subtitle={restaurantName ? `${restaurantName} · ${seatLabel}` : seatLabel}
      />
      {lines.length === 0 ? (
        <main className="px-6 py-20 text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-surface-2">
            <ShoppingBag className="size-9 text-fg-muted" aria-hidden="true" />
          </div>
          <p className="mt-5 text-lg font-bold">{t("guest.cartEmpty")}</p>
          <p className="mt-1 text-fg-muted">{t("guest.cartEmptyBody")}</p>
          <Link
            href="/table"
            className="mt-7 inline-flex h-12 items-center rounded-full bg-accent px-7 font-bold text-accent-fg"
          >
            {t("guest.backToMenu")}
          </Link>
          {orderCount > 0 ? (
            <Link href="/table/orders" className="mt-4 block text-sm font-semibold text-accent-text">
              {t("guest.ordersLink", { count: orderCount })}
            </Link>
          ) : null}
        </main>
      ) : (
        <main className="pb-40">
          <section className="px-4 pt-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">{t("guest.items", { count: itemCount })}</h2>
            </div>
            <ul className="mt-1">
              {lines.map((l) => (
                <CartLine key={l.id} line={l} money={money} />
              ))}
            </ul>
            <Link
              href="/table"
              className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-semibold active:bg-surface-3"
            >
              <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
              {t("guest.addMore")}
            </Link>
          </section>

          <div className="mt-6 h-2 bg-surface-2" />
          <NameForm displayName={displayName} />
          <div className="h-2 bg-surface-2" />

          <OrderPanel
            totalLabel={money(totals.totalCents)}
            disabled={hasIssues || totals.totalCents === 0}
            hasIssues={hasIssues}
            summary={
              <dl className="space-y-2 text-[15px]">
                {!pricesIncludeTax ? (
                  <div className="flex justify-between">
                    <dt className="text-fg-muted">{t("guest.subtotal")}</dt>
                    <dd className="tabular-nums">{money(totals.subtotalCents)}</dd>
                  </div>
                ) : null}
                {totals.taxes.map((tx) => (
                  <div key={tx.rateBps} className="flex justify-between text-fg-muted">
                    <dt>
                      {pricesIncludeTax
                        ? t("guest.vat", { rate: rate(tx.rateBps) })
                        : t("guest.vatExcl", { rate: rate(tx.rateBps) })}
                    </dt>
                    <dd className="tabular-nums">{money(tx.taxCents)}</dd>
                  </div>
                ))}
                <div className="flex justify-between pt-1 text-lg font-semibold">
                  <dt>{t("guest.total")}</dt>
                  <dd className="tabular-nums">{money(totals.totalCents)}</dd>
                </div>
              </dl>
            }
          />
          <p className="px-4 pt-2 text-center text-xs text-fg-subtle">{t("guest.personal")}</p>
          {orderCount > 0 ? (
            <Link
              href="/table/orders"
              className="mt-3 block text-center text-sm font-semibold text-accent-text"
            >
              {t("guest.ordersLink", { count: orderCount })}
            </Link>
          ) : null}
        </main>
      )}
    </>
  );
}

function OrderPanel({
  totalLabel,
  disabled,
  hasIssues,
  summary,
}: {
  totalLabel: string;
  disabled: boolean;
  hasIssues: boolean;
  summary: React.ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section className="space-y-5 px-4 pt-5">
      <label className="block">
        <span className="font-bold">{t("guest.forKitchen")}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={t("guest.orderNotePlaceholder")}
          className="mt-2 w-full resize-none rounded-2xl bg-surface-2 px-4 py-3 text-[16px] placeholder:text-fg-muted focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
        />
      </label>
      {summary}
      {hasIssues ? <p className="text-sm font-medium text-danger">{t("guest.fixCart")}</p> : null}
      {error ? (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl border-t border-border bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <button
          type="button"
          disabled={disabled || pending}
          aria-busy={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await placeOrderAction(note);
              if (res?.ok) router.push("/table/orders?placed=1");
              else if (res) {
                setError(
                  t.has(`errorCodes.${res.error}`) ? t(`errorCodes.${res.error}`) : t("errorCodes.internal"),
                );
                router.refresh();
              }
            })
          }
          className="flex h-14 w-full items-center justify-between rounded-full bg-accent px-6 text-lg font-bold text-accent-fg transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          <span>{pending ? "…" : t("guest.checkout")}</span>
          <span className="tabular-nums">{totalLabel}</span>
        </button>
      </div>
    </section>
  );
}

function CartLine({ line: l, money }: { line: CartLineView; money: (c: number) => string }) {
  const t = useTranslations("guest");
  const tErr = useTranslations("errorCodes");
  const [quantity, setQuantity] = useOptimistic(l.quantity);
  const [pending, startTransition] = useTransition();
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(l.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const report = (res: Awaited<ReturnType<typeof setQuantityAction>>) =>
    setError(res && !res.ok ? (tErr.has(res.error) ? tErr(res.error) : tErr("internal")) : null);

  return (
    <li className={cn("border-b border-border py-4 last:border-0", pending && "opacity-60")}>
      <div className="flex gap-3">
        {l.image ? (
          <img
            src={l.image}
            alt=""
            width={72}
            height={72}
            className="size-[72px] shrink-0 rounded-2xl bg-surface-2 object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-bold">{l.name || "—"}</p>
          {l.line?.selections.length ? (
            <p className="mt-0.5 text-sm text-fg-muted">
              {l.line.selections
                .map((s) =>
                  s.priceDeltaCents ? `${s.valueName} (+${money(s.priceDeltaCents)})` : s.valueName,
                )
                .join(" · ")}
            </p>
          ) : null}
          {l.issue ? (
            <p role="alert" className="mt-1 text-sm font-medium text-danger">
              {t.has(`issues.${l.issue}`) ? t(`issues.${l.issue}`) : t("issues.product_unavailable")}
            </p>
          ) : null}
          {editingNote ? (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const res = await setNoteAction(l.id, note);
                  report(res);
                  if (res?.ok) setEditingNote(false);
                });
              }}
            >
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={280}
                autoFocus
                aria-label={t("note")}
                placeholder={t("notePlaceholder")}
                className="h-10 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-[16px] focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
              />
              <button
                type="submit"
                className="h-10 rounded-full bg-accent px-4 text-sm font-bold text-accent-fg"
              >
                {t("save")}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="mt-1 text-start text-sm font-medium text-fg-muted"
            >
              {l.note ? `« ${l.note} »` : `+ ${t("note")}`}
            </button>
          )}
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="font-bold tabular-nums">{l.line ? money(l.line.lineTotalCents) : ""}</p>
            <QuantityStepper
              size="md"
              value={quantity}
              min={1}
              disabled={pending}
              onRemove={() => startTransition(async () => report(await removeItemAction(l.id)))}
              onChange={(n) =>
                startTransition(async () => {
                  setQuantity(n);
                  report(await setQuantityAction(l.id, n));
                })
              }
            />
          </div>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function NameForm({ displayName }: { displayName: string | null }) {
  const t = useTranslations("guest");
  const [state, action, pending] = useActionState(renameAction, null);
  return (
    <form action={action} className="px-4 py-5">
      <label htmlFor="guest-name" className="flex items-center gap-2 font-bold">
        <UserRound className="size-5" aria-hidden="true" />
        {t("nameShort")}
        <span className="text-sm font-normal text-fg-subtle">· {t("yourNameHint")}</span>
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="guest-name"
          name="displayName"
          defaultValue={displayName ?? ""}
          maxLength={24}
          autoComplete="given-name"
          placeholder={t("namePlaceholder")}
          className="h-12 min-w-0 flex-1 rounded-full bg-surface-2 px-5 text-[16px] placeholder:text-fg-muted focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-12 shrink-0 rounded-full bg-surface-2 px-5 text-sm font-bold active:bg-surface-3"
        >
          {state?.ok ? "✓" : t("save")}
        </button>
      </div>
    </form>
  );
}
