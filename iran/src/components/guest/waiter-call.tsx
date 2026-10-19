"use client";

import { BellRing, Check, Droplets, HandPlatter, Receipt, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { callWaiterAction } from "@/app/[locale]/table/actions";
import { cn } from "@/lib/cn";

const KINDS = [
  { key: "waiter", Icon: HandPlatter, tone: "bg-tone-orange/12 text-tone-orange" },
  { key: "bill", Icon: Receipt, tone: "bg-tone-emerald/12 text-tone-emerald" },
  { key: "water", Icon: Droplets, tone: "bg-tone-sky/12 text-tone-sky" },
] as const;

/** "Call the waiter" button on the identity card: waiter, the bill, or water. */
export function WaiterCall({ className }: { className?: string }) {
  const t = useTranslations("guest.waiter");
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        onClick={() => (setOpen(true), setSent(null), setError(null))}
        className={cn(
          "inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent ps-3.5 pe-4 text-sm font-semibold text-accent-fg shadow-accent",
          "atelier:bg-transparent atelier:text-fg atelier:shadow-none atelier:ring-1 atelier:ring-border-strong nuit:shadow-none",
          className,
        )}
        title={t("call")}
      >
        <BellRing className="size-[18px]" aria-hidden="true" />
        {t("short")}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-end"
          role="dialog"
          aria-modal="true"
          aria-label={t("call")}
        >
          <button
            type="button"
            aria-label={t("close")}
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="animate-sheet-up relative w-full rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-lg font-bold">{t("title")}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-full bg-surface-2"
                aria-label={t("close")}
              >
                <X className="size-4" />
              </button>
            </div>
            {sent ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="grid size-16 place-items-center rounded-full bg-success-soft text-success">
                  <Check className="size-8" />
                </span>
                <p className="font-bold">{t("sent")}</p>
                <p className="text-sm text-fg-muted">{t(`sentHint.${sent}`)}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {KINDS.map(({ key, Icon, tone }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        setError(null);
                        const res = await callWaiterAction(key);
                        if (res?.ok) setSent(key);
                        else setError(res?.error === "too_soon" ? t("tooSoon") : t("failed"));
                      })
                    }
                    className="flex flex-col items-center gap-2 rounded-2xl border border-border p-4 text-sm font-semibold active:scale-95 disabled:opacity-50"
                  >
                    <span className={cn("grid size-12 place-items-center rounded-2xl", tone)}>
                      <Icon className="size-6" />
                    </span>
                    {t(`kinds.${key}`)}
                  </button>
                ))}
              </div>
            )}
            {error ? <p className="mt-3 text-center text-sm font-medium text-danger">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
