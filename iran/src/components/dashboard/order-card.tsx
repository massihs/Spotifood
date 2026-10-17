"use client";

import { formatMoney } from "@/lib/money";
import { useTranslations, useLocale } from "next-intl";
import { TimeAgo } from "@/components/ui/time-ago";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Clock, MessageSquareText, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { nextStatus, type OrderStatus } from "@/server/modules/orders/status";
import { updateOrderStatusAction } from "@/app/[locale]/dashboard/[restaurantId]/orders/actions";

export type OrderCardData = {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: string;
  tableLabel: string | null;
  totalCents: number;
  currency: string;
  note: string | null;
  placedAt: Date;
  customerPhone?: string | null;
  participantSeq: number | null;
  participantName: string | null;
  items: {
    id: string;
    quantity: number;
    productName: string;
    options: { valueName: string }[];
    note: string | null;
  }[];
};

/** Status → dot colour + soft chip background. */
const TONE: Record<OrderStatus, { dot: string; chip: string }> = {
  pending_payment: { dot: "bg-fg-subtle", chip: "bg-surface-2 text-fg-muted" },
  received: { dot: "bg-accent", chip: "bg-accent-soft text-accent-text" },
  accepted: { dot: "bg-warning", chip: "bg-warning-soft text-fg" },
  preparing: { dot: "bg-warning", chip: "bg-warning-soft text-fg" },
  ready: { dot: "bg-success", chip: "bg-success-soft text-success" },
  served: { dot: "bg-fg-subtle", chip: "bg-surface-2 text-fg-muted" },
  cancelled: { dot: "bg-danger", chip: "bg-danger-soft text-danger" },
};

export function OrderCard({
  restaurantId,
  order: o,
  canUpdate,
  canCancel,
  timeZone,
  compact = false,
}: {
  restaurantId: string;
  order: OrderCardData;
  canUpdate: boolean;
  canCancel: boolean;
  timeZone: string;
  /** Kitchen columns: the column already names the status, so drop the chip. */
  compact?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = nextStatus(o.status);
  const who = o.participantName ?? (o.participantSeq ? t("orders.client", { n: o.participantSeq }) : null);

  const move = (to: OrderStatus, reason?: string) =>
    startTransition(async () => {
      const res = await updateOrderStatusAction(restaurantId, o.id, to, reason);
      if (res && !res.ok) {
        setError(t.has(`errorCodes.${res.error}`) ? t(`errorCodes.${res.error}`) : t("errorCodes.internal"));
        if (res.error === "status_changed" || res.error === "invalid_transition") router.refresh();
      } else setError(null);
    });

  const tone = TONE[o.status];
  const isNew = o.status === "received" || o.status === "pending_payment";
  const [now] = useState(() => Date.now());
  // Waiting more than 10 minutes without being ready: shown in orange.
  const late =
    ["received", "accepted", "preparing", "pending_payment"].includes(o.status) &&
    now - new Date(o.placedAt).getTime() > 10 * 60_000;
  const paid = o.paymentStatus === "paid";

  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden transition-opacity",
        isNew && "border-accent ring-4 ring-accent/15",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-accent-soft px-1 font-semibold text-accent-text tabular-nums",
              (o.tableLabel?.length ?? 0) > 3 ? "text-[10px] leading-tight break-all" : "text-base",
            )}
            aria-hidden="true"
          >
            {o.tableLabel ?? "—"}
          </span>
          <div className="min-w-0">
            <p className="text-lg leading-tight font-bold whitespace-nowrap tabular-nums">
              <bdi dir="ltr">#{o.number}</bdi>
            </p>
            <p className="truncate text-xs text-fg-muted">
              {o.tableLabel ? t("orders.table", { label: o.tableLabel }) : "—"}
              {who ? ` · ${who}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {compact ? null : (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                tone.chip,
              )}
            >
              <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden="true" />
              {t(`orderStatus.${o.status}`)}
            </span>
          )}
          {isNew ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2.5 py-0.5 text-[11px] font-bold text-white">
              <span className="size-1.5 animate-ping rounded-full bg-white" aria-hidden="true" />
              {t("orders.new")}
            </span>
          ) : null}
          <span
            className={cn(
              "flex items-center gap-1 text-xs whitespace-nowrap",
              late ? "font-semibold text-warning" : "text-fg-subtle",
            )}
          >
            <Clock className="size-3" aria-hidden="true" />
            <TimeAgo date={o.placedAt} timeZone={timeZone} />
          </span>
        </div>
      </div>
      <ul className="mx-4 divide-y divide-border rounded-2xl bg-surface-2/70 text-sm">
        {o.items.map((i) => (
          <li key={i.id} className="flex gap-3 px-3 py-2.5">
            <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-lg bg-surface px-1 text-xs font-bold tabular-nums shadow-[var(--shadow-soft)]">
              {i.quantity}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{i.productName}</span>
              {i.options.length ? (
                <span className="block text-xs text-fg-muted">
                  {i.options.map((x) => x.valueName).join(" · ")}
                </span>
              ) : null}
              {i.note ? (
                <span className="mt-0.5 block text-xs font-semibold text-accent-text">↳ {i.note}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {o.customerPhone ? (
        <a
          href={`tel:${o.customerPhone}`}
          dir="ltr"
          onClick={(e) => e.stopPropagation()}
          className="mx-4 mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-fg-muted"
        >
          <Phone className="size-3.5" aria-hidden="true" />
          {o.customerPhone}
        </a>
      ) : null}
      {o.note ? (
        <p className="mx-4 mt-2 flex gap-2 rounded-2xl bg-warning-soft px-3 py-2 text-sm">
          <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-bold">{t("orders.note")} : </span>
            {o.note}
          </span>
        </p>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-2 px-4 pt-3">
        <p className="font-bold tabular-nums">{formatMoney(o.totalCents, o.currency, locale)}</p>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-bold",
            paid ? "bg-success-soft text-success" : "bg-surface-2 text-fg-muted",
          )}
        >
          {paid ? t("orders.paid") : t("orders.unpaid")}
        </span>
      </div>
      <div className="flex gap-2 p-4 pt-3">
        {canCancel && o.status !== "served" && o.status !== "cancelled" ? (
          <Button
            variant="secondary"
            size="md"
            disabled={pending}
            aria-label={t("orders.cancel")}
            title={t("orders.cancel")}
            className="shrink-0 px-3.5"
            onClick={() => {
              if (!window.confirm(t("orders.cancelConfirm", { number: o.number }))) return;
              const reason = window.prompt(t("orders.cancelReason")) ?? undefined;
              move("cancelled", reason || undefined);
            }}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        {canUpdate && next ? (
          <Button
            size="md"
            variant={next === "ready" ? "accent" : "primary"}
            disabled={pending}
            className="flex-1"
            onClick={() => move(next)}
          >
            {t(`orders.next.${next}`)}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="px-4 pb-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
