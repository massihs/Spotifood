"use client";

import { ChevronDown, Pause, Play } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { pauseOnlineAction } from "@/app/[locale]/dashboard/[restaurantId]/live-actions";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

const MINUTES = [15, 30, 60, 120] as const;

/**
 * Online ordering status, with the busy mode: pause the online orders for a while during a rush,
 * resume in one tap. Tables, counter and kiosk keep taking orders.
 */
export function OnlinePause({
  restaurantId,
  pausedUntil,
  canPause,
  timeZone,
}: {
  restaurantId: string;
  pausedUntil: string | null;
  canPause: boolean;
  timeZone: string;
}) {
  const t = useTranslations("dashboard.online");
  const format = useFormatter();
  const [until, setUntil] = useState(pausedUntil);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  // The pause ends by itself: the pill follows without a reload.
  useEffect(() => {
    if (!until) return;
    const id = setTimeout(() => setUntil(null), Math.max(0, new Date(until).getTime() - Date.now()));
    return () => clearTimeout(id);
  }, [until]);

  const run = (minutes: number, done?: () => void) =>
    start(async () => {
      setError(false);
      const res = await pauseOnlineAction(restaurantId, minutes);
      if (res?.ok) {
        setUntil(res.data?.until ?? null);
        done?.();
      } else setError(true);
    });

  const time = (iso: string) =>
    format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone });

  if (until) {
    return (
      <div className="flex items-center gap-1 rounded-full bg-warning-soft p-1 ps-3 text-sm font-semibold text-warning">
        <Pause className="size-4 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">{t("pausedUntil", { time: time(until) })}</span>
        {canPause ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(0)}
            className="ms-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-fg shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Play className="size-3.5" aria-hidden="true" />
            {t("resume")}
          </button>
        ) : null}
        {error ? <span className="sr-only">{t("error")}</span> : null}
      </div>
    );
  }

  const pill = (
    <>
      <span className="relative flex size-2.5" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />
        <span className="relative inline-flex size-2.5 rounded-full bg-success" />
      </span>
      <span className="whitespace-nowrap">{t("open")}</span>
    </>
  );
  if (!canPause)
    return (
      <span className="inline-flex h-10 items-center gap-2 rounded-full bg-success-soft px-3.5 text-sm font-semibold text-success">
        {pill}
      </span>
    );
  return (
    <Dialog
      title={t("pauseTitle")}
      description={t("pauseHint")}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-success-soft px-3.5 text-sm font-semibold text-success transition-opacity hover:opacity-90"
        >
          {pill}
          <ChevronDown className="size-4 opacity-70" aria-hidden="true" />
        </button>
      )}
    >
      <PauseChoices pending={pending} error={error} onPick={run} />
    </Dialog>
  );
}

function PauseChoices({
  pending,
  error,
  onPick,
}: {
  pending: boolean;
  error: boolean;
  onPick: (minutes: number, done?: () => void) => void;
}) {
  const t = useTranslations("dashboard.online");
  const dialog = useDialog();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            disabled={pending}
            onClick={() => onPick(m, () => dialog?.close())}
            className={cn(
              "flex h-14 items-center justify-center gap-2 rounded-2xl bg-surface-2 text-base font-bold transition-colors",
              "hover:bg-warning-soft hover:text-warning disabled:opacity-60",
            )}
          >
            <Pause className="size-4" aria-hidden="true" />
            {m < 60 ? t("minutes", { n: m }) : t("hours", { n: m / 60 })}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {t("error")}
        </p>
      ) : null}
    </div>
  );
}
