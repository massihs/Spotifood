"use client";

import { CreditCard, Store, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelUnpaidOrderAction, payOnSiteAction, payOnlineOrderAction } from "../../order/actions";

/** An online order not paid yet: pay now, pay at pickup / on delivery, or give up. */
export function UnpaidPanel({
  slug,
  orderId,
  provider,
  onSite,
  failed,
  delivery,
}: {
  slug: string;
  orderId: string;
  provider: string | null;
  onSite: boolean;
  failed: boolean;
  delivery: boolean;
}) {
  const t = useTranslations("online.payment");
  const te = useTranslations("errorCodes");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  type Result = { ok: true; data?: unknown } | { ok: false; error: string } | null | undefined;
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      const redirect = res?.ok ? (res.data as { redirectUrl?: string } | undefined)?.redirectUrl : undefined;
      if (redirect) {
        window.location.assign(redirect);
        return;
      }
      if (res && !res.ok) setError(te.has(res.error) ? te(res.error) : te("internal"));
    });
  return (
    <div
      className={
        failed ? "space-y-3 rounded-2xl bg-danger-soft p-4" : "space-y-3 rounded-2xl bg-warning-soft p-4"
      }
      role="status"
    >
      <p className="font-semibold">{failed ? t("failed") : t("waiting")}</p>
      <p className="text-sm text-fg-muted">{t("waitingHint")}</p>
      <div className="grid gap-2">
        {provider ? (
          <Button
            size="lg"
            disabled={pending}
            onClick={() => run(() => payOnlineOrderAction(slug, orderId, provider, crypto.randomUUID()))}
          >
            <CreditCard className="size-4" aria-hidden="true" />
            {failed ? t("retry") : t("payNowShort")}
          </Button>
        ) : null}
        {onSite ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => payOnSiteAction(slug, orderId))}
          >
            <Store className="size-4" aria-hidden="true" />
            {delivery ? t("switchDelivery") : t("switchPickup")}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("cancelConfirm"))) run(() => cancelUnpaidOrderAction(slug, orderId));
          }}
        >
          <X className="size-4" aria-hidden="true" />
          {t("cancel")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
