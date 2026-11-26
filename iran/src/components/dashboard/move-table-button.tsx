"use client";

import { ArrowLeftRight } from "@/components/icons";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { moveTableAction } from "@/app/[locale]/dashboard/[restaurantId]/live-actions";

/** Moves the guests (session and orders) of a table to a free one. */
export function MoveTableButton({
  restaurantId,
  tableId,
  freeTables,
}: {
  restaurantId: string;
  tableId: string;
  freeTables: { id: string; label: string }[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (!freeTables.length) return null;
  return open ? (
    <select
      autoFocus
      disabled={pending}
      defaultValue=""
      onBlur={() => setOpen(false)}
      onChange={(e) => {
        const to = e.target.value;
        if (!to) return;
        start(async () => {
          const res = await moveTableAction(restaurantId, tableId, to);
          if (res?.ok) setOpen(false);
          else
            setMessage(
              t.has(`errorCodes.${res?.error}`) ? t(`errorCodes.${res?.error}`) : t("errorCodes.internal"),
            );
        });
      }}
      className="kashi-btn h-8 border border-border-strong bg-surface px-2 text-xs [--cut:5px]"
      aria-label={t("floor.moveTo")}
    >
      <option value="">{t("floor.moveTo")}</option>
      {freeTables.map((ft) => (
        <option key={ft.id} value={ft.id}>
          {t("floor.tableN", { label: ft.label })}
        </option>
      ))}
    </select>
  ) : (
    <span className="flex flex-col items-end">
      <button
        type="button"
        onClick={() => (setOpen(true), setMessage(null))}
        className="kashi-btn kashi-frame inline-flex h-8 items-center gap-1 px-3 text-xs font-semibold [--cut:5px] [--kashi-fill-hover:var(--surface-2)]"
      >
        <ArrowLeftRight className="size-3.5" aria-hidden="true" />
        {t("floor.move")}
      </button>
      {message ? <span className="text-xs text-danger">{message}</span> : null}
    </span>
  );
}
