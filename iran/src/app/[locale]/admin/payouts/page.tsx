import { Suspense } from "react";
import { AlertTriangle, Landmark } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { bankName } from "@/lib/iban";
import { centsToInput, formatMoney } from "@/lib/money";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import {
  getPlatformPayments,
  listPayoutBalances,
  listRecentPayouts,
  platformMerchantId,
} from "@/server/modules/payouts/service";
import { CopyText, PayoutDialog, PlatformPaymentsForm } from "./payout-forms";

/** A bank account changed this recently is checked with the owner before any transfer. */
const RECENT_CHANGE_HOURS = 72;
const renderedAt = () => Date.now();

export default function AdminPayoutsPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Payouts />
    </Suspense>
  );
}

async function Payouts() {
  const admin = await requireSuperAdmin();
  const [t, format, locale, platform, balances, recent] = await Promise.all([
    getTranslations("admin.payouts"),
    getFormatter(),
    getLocale(),
    getPlatformPayments(db),
    listPayoutBalances(db, admin),
    listRecentPayouts(db, admin),
  ]);
  const now = renderedAt();
  const money = (c: number, currency: string) => formatMoney(c, currency, locale);
  const cur = balances[0]?.currency ?? "IRR";
  const total = (k: "dueCents" | "collectedCents" | "feeCents" | "splitCents") =>
    balances.reduce((s, b) => s + b[k], 0);
  const merchant = platformMerchantId();

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("statDue")} value={money(total("dueCents"), cur)} tone="amber" />
        <StatCard label={t("statCollected")} value={money(total("collectedCents"), cur)} tone="sky" />
        <StatCard label={t("statFee")} value={money(total("feeCents"), cur)} tone="emerald" />
        <StatCard label={t("statSplit")} value={money(total("splitCents"), cur)} tone="violet" />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="overflow-hidden">
          <CardHeader title={t("restaurants")} description={t("restaurantsHint")} />
          {balances.length === 0 ? (
            <p className="p-6 text-sm text-fg-muted">{t("empty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {balances.map((b) => {
                const changedHours = b.account ? (now - b.account.updatedAt.getTime()) / 3_600_000 : null;
                return (
                  <li
                    key={b.restaurantId}
                    className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{b.name}</p>
                      <p className="mt-1 text-xs text-fg-muted">
                        {t("counts", { n: b.count })} · {t("collected")} {money(b.collectedCents, b.currency)}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-muted">
                        {t("fee")} {money(b.feeCents, b.currency)} · {t("splitShort")}{" "}
                        {money(b.splitCents, b.currency)} · {t("paidOut")} {money(b.paidOutCents, b.currency)}
                      </p>
                      <p className="mt-2 text-lg font-bold tabular-nums">
                        {money(b.dueCents, b.currency)}{" "}
                        <span className="text-xs font-medium text-fg-muted">{t("due")}</span>
                      </p>
                    </div>
                    <div className="min-w-0 text-sm">
                      {b.account ? (
                        <>
                          <p className="flex items-center gap-1.5 font-medium">
                            <Landmark className="size-4 text-fg-muted" aria-hidden="true" />
                            <span className="truncate">{b.account.holderName}</span>
                          </p>
                          <p className="mt-1 flex items-center gap-1 font-mono text-xs" dir="ltr">
                            <span className="truncate">
                              {b.account.iban.replace(/(.{4})/g, "$1 ").trim()}
                            </span>
                            <CopyText value={b.account.iban} label={t("copy")} />
                          </p>
                          {b.account.card ? (
                            <p className="mt-0.5 flex items-center gap-1 font-mono text-xs" dir="ltr">
                              <span>{b.account.card.replace(/(.{4})/g, "$1 ").trim()}</span>
                              <CopyText value={b.account.card} label={t("copy")} />
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-fg-muted">
                            {bankName(b.account.bankCode, locale) ?? "—"}
                          </p>
                          {changedHours !== null && changedHours < RECENT_CHANGE_HOURS ? (
                            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2 py-1.5 text-xs">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                              {t("recentChange", {
                                hours: format.number(Math.max(1, Math.round(changedHours))),
                              })}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <Badge tone="warning">{t("noAccount")}</Badge>
                      )}
                    </div>
                    <div className="flex items-start lg:justify-end">
                      {b.dueCents > 0 && b.account ? (
                        <PayoutDialog
                          restaurantId={b.restaurantId}
                          name={b.name}
                          currency={b.currency}
                          dueInput={centsToInput(b.dueCents, locale, b.currency)}
                          dueLabel={money(b.dueCents, b.currency)}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="grid gap-5">
          <Card>
            <CardHeader title={t("settings")} description={t("settingsHint")} />
            <div className="space-y-4 p-5">
              <p className="text-sm">
                {t("merchant")}{" "}
                {merchant ? (
                  <Badge tone="success">{t("merchantOn")}</Badge>
                ) : (
                  <Badge tone="warning">{t("merchantOff")}</Badge>
                )}
              </p>
              <PlatformPaymentsForm feeBps={platform.feeBps} split={platform.split} />
            </div>
          </Card>
          <Card>
            <CardHeader title={t("recent")} />
            {recent.length === 0 ? (
              <p className="p-5 text-sm text-fg-muted">{t("noPayouts")}</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {recent.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block text-xs text-fg-muted">
                        {format.dateTime(p.paidAt, { dateStyle: "medium" })} ·{" "}
                        <span dir="ltr">#{p.reference}</span>
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {money(p.amountCents, p.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
