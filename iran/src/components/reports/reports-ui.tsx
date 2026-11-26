"use client";

import { CalendarRange, Plus, Trash2 } from "@/components/icons";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, field, useRun } from "@/components/ui/sheet-kit";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { parseMoneyInput } from "@/lib/money";
import {
  createExpenseAction,
  deleteExpenseAction,
  saveReportSettingsAction,
  saveDailyReportAction,
} from "@/app/[locale]/dashboard/[restaurantId]/reports/actions";
import { openSheet, useCreateParam } from "@/lib/use-create-param";

const CATEGORIES = [
  "rent",
  "salaries",
  "utilities",
  "supplies",
  "marketing",
  "maintenance",
  "taxes",
  "other",
] as const;
const METHODS = ["cash", "card", "transfer"] as const;

export function CustomPeriod({ base, from, to }: { base: string; from: string; to: string }) {
  const t = useTranslations("reports");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="kashi-btn kashi-frame inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm text-fg-muted [--kashi-fill:var(--surface)]"
      >
        <CalendarRange className="size-4" />
        {t("custom")}
      </button>
      {open ? (
        <Sheet title={t("custom")} onClose={() => setOpen(false)}>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              {t("from")}
              <input
                type="date"
                value={a}
                onChange={(e) => setA(e.target.value)}
                dir="ltr"
                className={cn(field, "mt-1")}
              />
            </label>
            <label className="block text-sm font-medium">
              {t("to")}
              <input
                type="date"
                value={b}
                onChange={(e) => setB(e.target.value)}
                dir="ltr"
                className={cn(field, "mt-1")}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!a || !b || a > b}
            onClick={() => {
              setOpen(false);
              router.push(`${base}${base.includes("?") ? "&" : "?"}from=${a}&to=${b}`);
            }}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-accent font-semibold text-accent-fg disabled:opacity-50"
          >
            {t("apply")}
          </button>
        </Sheet>
      ) : null}
    </>
  );
}

export function NewExpenseButton({ rid, currency, today }: { rid: string; currency: string; today: string }) {
  const t = useTranslations("reports");
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRun();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("rent");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [paidAt, setPaidAt] = useState(today);
  const cents = parseMoneyInput(amount, currency);
  const reset = () => (setOpen(false), setAmount(""), setDescription(""));
  useCreateParam("expense", openSheet(setOpen));
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="kashi-btn inline-flex h-10 items-center gap-2 bg-accent px-4 text-sm font-semibold text-accent-fg"
      >
        <Plus className="size-4" />
        {t("newExpense")}
      </button>
      {open ? (
        <Sheet title={t("newExpense")} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-xs font-semibold",
                    category === c ? "border-accent bg-accent-soft text-accent" : "border-border",
                  )}
                >
                  {t(`categories.${c}`)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                {t("amount")}
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="numeric"
                  dir="ltr"
                  className={cn(field, "mt-1")}
                  autoFocus
                />
              </label>
              <label className="block text-sm font-medium">
                {t("date")}
                <input
                  type="date"
                  value={paidAt}
                  max={today}
                  onChange={(e) => setPaidAt(e.target.value)}
                  dir="ltr"
                  className={cn(field, "mt-1")}
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-1">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "h-9 rounded-lg text-sm font-semibold",
                    method === m ? "bg-surface shadow-sm" : "text-fg-muted",
                  )}
                >
                  {t(`methods.${m}`)}
                </button>
              ))}
            </div>
            <label className="block text-sm font-medium">
              {t("description")}
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                className={cn(field, "mt-1")}
              />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button
              type="button"
              disabled={pending || !cents}
              onClick={() =>
                run(
                  () =>
                    createExpenseAction(rid, {
                      category,
                      amountCents: cents!,
                      description,
                      method,
                      paidAt: new Date(`${paidAt}T12:00:00`).toISOString(),
                    }),
                  reset,
                )
              }
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-accent font-semibold text-accent-fg disabled:opacity-50"
            >
              {t("save")}
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

export function DeleteExpense({ rid, id }: { rid: string; id: string }) {
  const t = useTranslations("reports");
  const { pending, run } = useRun();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => window.confirm(t("deleteExpense")) && run(() => deleteExpenseAction(rid, id))}
      className="grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-danger"
      aria-label={t("deleteExpense")}
    >
      <Trash2 className="size-4" />
    </button>
  );
}

/** Report settings: when the business day starts, and the period the reports open on. */
export function ReportSettingsForm({
  rid,
  dayStartHour,
  defaultPreset,
  foodCostTargetPct,
}: {
  rid: string;
  dayStartHour: number;
  defaultPreset: string;
  foodCostTargetPct: number;
}) {
  const t = useTranslations("reports.center.settings");
  const tp = useTranslations("reports.presets");
  const { pending, error, run } = useRun();
  const [hour, setHour] = useState(dayStartHour);
  const [preset, setPreset] = useState(defaultPreset);
  const [target, setTarget] = useState(foodCostTargetPct);
  const [saved, setSaved] = useState(false);
  return (
    <div className="max-w-xl space-y-4 rounded-2xl border border-border bg-surface p-5">
      <label className="block text-sm font-medium">
        {t("dayStart")}
        <select
          value={hour}
          onChange={(e) => {
            setHour(Number(e.target.value));
            setSaved(false);
          }}
          className={cn(field, "mt-1")}
        >
          {[0, 1, 2, 3, 4, 5, 6].map((h) => (
            <option key={h} value={h}>
              {t("hour", { h: String(h).padStart(2, "0") })}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs font-normal text-fg-muted">{t("dayStartHint")}</span>
      </label>
      <label className="block text-sm font-medium">
        {t("defaultPeriod")}
        <select
          value={preset}
          onChange={(e) => {
            setPreset(e.target.value);
            setSaved(false);
          }}
          className={cn(field, "mt-1")}
        >
          {(["today", "7d", "30d", "month"] as const).map((p) => (
            <option key={p} value={p}>
              {tp(p)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        {t("foodCostTarget")}
        <input
          type="number"
          min={10}
          max={80}
          value={target}
          onChange={(e) => {
            setTarget(Number(e.target.value));
            setSaved(false);
          }}
          className={cn(field, "mt-1 max-w-32")}
        />
        <span className="mt-1 block text-xs font-normal text-fg-muted">{t("foodCostTargetHint")}</span>
      </label>
      {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(
            () =>
              saveReportSettingsAction(rid, {
                dayStartHour: hour,
                defaultPreset: preset,
                foodCostTargetPct: target,
              }),
            () => setSaved(true),
          )
        }
        className="h-11 rounded-xl bg-accent px-5 font-bold text-accent-fg disabled:opacity-50"
      >
        {saved ? "✓" : t("save")}
      </button>
    </div>
  );
}

/** The evening report: on or off, the hour, and an SMS copy to a mobile number. */
export function DailyReportForm({
  rid,
  initial,
}: {
  rid: string;
  initial: { enabled: boolean; hour: number; sms: boolean; phone: string };
}) {
  const t = useTranslations("dailyReport.settings");
  const { pending, error, run } = useRun();
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<typeof v>) => {
    setV({ ...v, ...patch });
    setSaved(false);
  };
  return (
    <div className="max-w-xl space-y-4 rounded-2xl border border-border bg-surface p-5">
      <div>
        <p className="font-semibold">{t("title")}</p>
        <p className="mt-1 text-sm text-fg-muted">{t("hint")}</p>
      </div>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          className="size-5 accent-[var(--accent)]"
          checked={v.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        {t("enabled")}
      </label>
      <label className="block text-sm font-medium">
        {t("hour")}
        <select
          value={v.hour}
          onChange={(e) => set({ hour: Number(e.target.value) })}
          className={cn(field, "mt-1 max-w-40")}
          disabled={!v.enabled}
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          className="size-5 accent-[var(--accent)]"
          checked={v.sms}
          disabled={!v.enabled}
          onChange={(e) => set({ sms: e.target.checked })}
        />
        {t("sms")}
      </label>
      {v.sms && v.enabled ? (
        <input
          className={field}
          dir="ltr"
          inputMode="tel"
          placeholder="09xx xxx xxxx"
          value={v.phone}
          onChange={(e) => set({ phone: e.target.value })}
        />
      ) : null}
      <p className="text-xs text-fg-muted">{t("push")}</p>
      {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(
            () => saveDailyReportAction(rid, v),
            () => setSaved(true),
          )
        }
        className="h-11 rounded-xl bg-accent px-5 font-bold text-accent-fg disabled:opacity-50"
      >
        {saved ? "✓" : t("save")}
      </button>
    </div>
  );
}
