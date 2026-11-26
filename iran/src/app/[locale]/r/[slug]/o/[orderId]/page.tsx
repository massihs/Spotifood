import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Check, Phone } from "@/components/icons";
import { getLocale, getTranslations } from "next-intl/server";
import { AutoRefresh } from "@/components/reservations/public-ui";
import { PlaceHeader } from "@/components/reservations/place-header";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Amount } from "@/components/ui/amount";
import { formatMoney } from "@/lib/money";
import { getCurrentDiner } from "@/server/auth/diner";
import { db } from "@/server/db/client";
import { getOnlineOrder, onlinePaymentChoices } from "@/server/modules/online/service";
import { onlineOrderPayment } from "@/server/modules/payments/service";
import { UnpaidPanel } from "./pay-panel";
import { PushButton } from "@/components/push/push-button";
import { vapidPublicKey } from "@/server/modules/push/service";

type Props = PageProps<"/[locale]/r/[slug]/o/[orderId]">;

export const metadata: Metadata = { robots: { index: false, follow: false } };

const STEPS = ["received", "accepted", "preparing", "ready", "served"] as const;

export default function OnlineOrderStatusPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Status params={params} />
    </Suspense>
  );
}

async function Status({ params }: Pick<Props, "params">) {
  const { slug, orderId } = await params;
  const diner = await getCurrentDiner();
  if (!diner) notFound();
  const found = await getOnlineOrder(db, diner.id, slug, orderId);
  if (!found) notFound();
  const o = found.order;
  const [t, locale, latest, choices] = await Promise.all([
    getTranslations("online"),
    getLocale(),
    onlineOrderPayment(db, o.id),
    onlinePaymentChoices(db, o.restaurantId),
  ]);
  const awaitingPayment = o.status === "pending_payment" && o.paymentStatus !== "paid";
  const money = (c: number) => formatMoney(c, o.currency, locale);
  const done = o.status === "served" || o.status === "cancelled";
  const at = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  return (
    <div data-brand={found.brandColor}>
      {!done ? <AutoRefresh seconds={15} /> : null}
      <PlaceHeader
        name={found.restaurantName}
        logoKey={found.logoKey}
        title={t("statusTitle", { number: o.number })}
      />
      <main className="relative mx-auto -mt-8 max-w-md space-y-4 rounded-t-3xl bg-bg px-4 pt-6 pb-12">
        {awaitingPayment ? (
          <UnpaidPanel
            slug={slug}
            orderId={o.id}
            provider={choices.provider}
            onSite={choices.onSite || !choices.provider}
            failed={latest?.status === "failed" || latest?.status === "cancelled"}
            delivery={o.channel === "delivery"}
          />
        ) : null}
        {o.paymentStatus === "paid" && latest?.status === "succeeded" ? (
          <p className="flex items-center gap-2 rounded-2xl bg-success-soft p-4 font-semibold text-success">
            <Check className="size-5" strokeWidth={3} aria-hidden="true" />
            {t("payment.paid")}
          </p>
        ) : null}
        {o.status === "cancelled" ? (
          <p className="rounded-2xl bg-danger-soft p-4 text-center font-semibold text-danger">
            {t("cancelled")}
          </p>
        ) : (
          // A vertical timeline: the steps behind filled in, the current one lit, the next ones faint.
          <ol className="rounded-3xl border border-border/80 bg-surface p-5 shadow-[var(--shadow-soft)]">
            {STEPS.map((s, i) => (
              <li
                key={s}
                aria-current={i === at ? "step" : undefined}
                className="relative flex items-center gap-3.5 pb-5 last:pb-0"
              >
                {i < STEPS.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute start-[17px] top-9 bottom-0 w-0.5 rounded-full",
                      i < at ? "bg-accent" : "bg-border",
                    )}
                  />
                ) : null}
                <span
                  className={cn(
                    "relative grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold",
                    i < at
                      ? "bg-accent text-accent-fg"
                      : i === at
                        ? "bg-accent text-accent-fg ring-4 ring-accent/20"
                        : "bg-surface-2 text-fg-subtle",
                  )}
                  aria-hidden="true"
                >
                  {i < at || (i === at && s === "served") ? (
                    <Check className="size-4" strokeWidth={3} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    i === at
                      ? "text-base font-extrabold text-fg"
                      : i < at
                        ? "text-sm text-fg-muted"
                        : "text-sm text-fg-subtle",
                  )}
                >
                  {t(`steps.${o.channel === "delivery" ? "delivery" : "takeaway"}.${s}`)}
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="rounded-3xl border border-border/80 bg-surface p-5 text-sm shadow-[var(--shadow-soft)]">
          <ul className="space-y-2.5">
            {found.items.map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className="grid h-6 min-w-6 place-items-center rounded-md bg-surface-2 px-1 text-xs font-bold tabular-nums">
                    {it.quantity}
                  </span>
                  <span className="font-medium">{it.name}</span>
                </span>
                <Amount text={money(it.lineTotalCents)} className="font-semibold" />
              </li>
            ))}
            {o.deliveryFeeCents ? (
              <li className="flex justify-between gap-3 text-fg-muted">
                <span>{t("deliveryFee")}</span>
                <span className="tabular-nums">{money(o.deliveryFeeCents)}</span>
              </li>
            ) : null}
            {o.discountCents ? (
              <li className="flex justify-between gap-3 text-success">
                <span>{t("discount")}</span>
                <span className="tabular-nums">−{money(o.discountCents)}</span>
              </li>
            ) : null}
          </ul>
          <p className="mt-4 flex items-baseline justify-between border-t border-border pt-3 text-base font-extrabold">
            <span>{t("total")}</span>
            <Amount text={money(o.totalCents)} className="text-xl" />
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            {o.paymentStatus === "paid"
              ? t("payment.paidShort")
              : awaitingPayment
                ? t("payment.waiting")
                : o.channel === "delivery"
                  ? t("payOnDelivery")
                  : t("payAtPickup")}
          </p>
          {o.deliveryAddress ? <p className="mt-3 text-fg-muted">{o.deliveryAddress}</p> : null}
        </div>
        {!done && vapidPublicKey() ? <PushButton publicKey={vapidPublicKey()!} className="w-full" /> : null}
        {found.restaurantPhone ? (
          <a
            href={`tel:${found.restaurantPhone}`}
            className="flex h-14 items-center justify-center gap-2 rounded-full bg-surface font-bold shadow-[var(--shadow-soft)] ring-1 ring-border hover:bg-surface-2"
          >
            <Phone className="size-4" aria-hidden="true" />
            {t("call")}
          </a>
        ) : null}
        <Link
          href={`/r/${slug}/order`}
          className="flex h-14 items-center justify-center rounded-full bg-accent font-bold text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.22),var(--shadow-accent)]"
        >
          {t("again")}
        </Link>
      </main>
    </div>
  );
}
