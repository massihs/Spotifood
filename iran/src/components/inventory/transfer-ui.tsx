"use client";

import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { field, num, Sheet, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { transferStockAction } from "@/app/[locale]/dashboard/[restaurantId]/inventory/actions";

/** Send stock to another venue of the group (central kitchen → branch). */
export function TransferButton({
  rid,
  targets,
  items,
}: {
  rid: string;
  targets: { id: string; name: string }[];
  items: { id: string; name: string; unit: string; quantity: number }[];
}) {
  const t = useTranslations("inventory.transfer");
  const tu = useTranslations("inventory.units");
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRun();
  const [to, setTo] = useState(targets[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([{ stockItemId: items[0]?.id ?? "", quantity: "" }]);
  const valid = to && lines.every((l) => l.stockItemId && num(l.quantity) > 0);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-border"
      >
        <ArrowLeftRight className="size-4" />
        {t("button")}
      </button>
      {open ? (
        <Sheet title={t("title")} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <label className="block text-sm font-medium">
              {t("to")}
              <select className={cn(field, "mt-1")} value={to} onChange={(e) => setTo(e.target.value)}>
                {targets.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            {lines.map((l, i) => {
              const item = items.find((x) => x.id === l.stockItemId);
              return (
                <div key={i} className="flex items-end gap-2">
                  <label className="min-w-0 flex-1 text-sm font-medium">
                    {i === 0 ? t("item") : null}
                    <select
                      className={cn(field, "mt-1")}
                      value={l.stockItemId}
                      onChange={(e) =>
                        setLines(lines.map((x, j) => (j === i ? { ...x, stockItemId: e.target.value } : x)))
                      }
                    >
                      {items.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x.quantity} {tu(x.unit)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="w-28 text-sm font-medium">
                    {i === 0 ? t("quantity") : null}
                    <input
                      inputMode="decimal"
                      dir="ltr"
                      className={cn(field, "mt-1")}
                      placeholder={item ? tu(item.unit) : ""}
                      value={l.quantity}
                      onChange={(e) =>
                        setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))
                      }
                    />
                  </label>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      aria-label="×"
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                      className="grid size-11 place-items-center rounded-xl text-fg-muted ring-1 ring-border"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setLines([...lines, { stockItemId: items[0]?.id ?? "", quantity: "" }])}
              className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text"
            >
              <Plus className="size-4" />
              {t("addLine")}
            </button>
            <input
              className={field}
              placeholder={t("note")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="text-xs text-fg-muted">{t("hint")}</p>
            {error ? (
              <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
            ) : null}
            <button
              type="button"
              disabled={pending || !valid}
              onClick={() =>
                run(
                  () =>
                    transferStockAction(rid, {
                      toRestaurantId: to,
                      note,
                      lines: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: num(l.quantity) })),
                    }),
                  () => setOpen(false),
                )
              }
              className="h-11 w-full rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-50"
            >
              {t("send")}
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
