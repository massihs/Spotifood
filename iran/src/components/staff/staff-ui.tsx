"use client";

import { Clock, Copy, LogIn, LogOut, Pencil, Plus, Trash2 } from "@/components/icons";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { field, Sheet, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import {
  addShiftAction,
  addTipsAction,
  clockAction,
  copyWeekAction,
  deleteEntryAction,
  deleteShiftAction,
  deleteTipsAction,
  saveEntryAction,
  setRateAction,
} from "@/app/[locale]/dashboard/[restaurantId]/staff/actions";

/** Running time since a moment, refreshed every 30 s ("2 h 05"). */
function useElapsed(since: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [since]);
  if (!since) return null;
  const min = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

/** Clock in / out, in the dashboard's top bar: every member, one tap. */
export function ClockButton({ rid, since }: { rid: string; since: string | null }) {
  const t = useTranslations("staff.clock");
  const { pending, run } = useRun();
  const elapsed = useElapsed(since);
  const on = !!since;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => clockAction(rid, on ? "out" : "in"))}
      title={on ? t("out") : t("in")}
      className={cn(
        "kashi-btn inline-flex h-10 items-center gap-1.5 px-3 text-sm font-semibold transition-colors disabled:opacity-60",
        on
          ? "bg-success-soft text-success ring-1 ring-success/30"
          : "bg-surface-2 text-fg-muted hover:text-fg",
      )}
    >
      {on ? (
        <LogOut className="size-4" aria-hidden="true" />
      ) : (
        <LogIn className="size-4" aria-hidden="true" />
      )}
      <span className="max-sm:sr-only">{on ? t("working", { time: elapsed ?? "" }) : t("in")}</span>
    </button>
  );
}

type Member = { userId: string; name: string };

function SpanFields({
  members,
  value,
  onChange,
  optionalEnd,
}: {
  members: Member[];
  value: { userId: string; day: string; start: string; end: string; note: string };
  onChange: (v: typeof value) => void;
  optionalEnd?: boolean;
}) {
  const t = useTranslations("staff.form");
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        {t("person")}
        <select
          className={cn(field, "mt-1")}
          value={value.userId}
          onChange={(e) => onChange({ ...value, userId: e.target.value })}
        >
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        {t("day")}
        <DateInput className="mt-1" value={value.day} onChange={(day) => onChange({ ...value, day })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">
          {t("start")}
          <input
            type="time"
            dir="ltr"
            className={cn(field, "mt-1")}
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
          />
        </label>
        <label className="block text-sm font-medium">
          {optionalEnd ? t("endOptional") : t("end")}
          <input
            type="time"
            dir="ltr"
            className={cn(field, "mt-1")}
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
          />
        </label>
      </div>
      <p className="text-xs text-fg-muted">{t("overnight")}</p>
      <input
        className={field}
        placeholder={t("note")}
        maxLength={120}
        value={value.note}
        onChange={(e) => onChange({ ...value, note: e.target.value })}
      />
    </div>
  );
}

/** Add or correct a period worked. */
export function EntryButton({
  rid,
  members,
  today,
  entry,
}: {
  rid: string;
  members: Member[];
  today: string;
  entry?: { id: string; userId: string; day: string; start: string; end: string; note: string };
}) {
  const t = useTranslations("staff.clock");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRun();
  const [v, setV] = useState(
    entry ?? { userId: members[0]?.userId ?? "", day: today, start: "09:00", end: "17:00", note: "" },
  );
  return (
    <>
      {entry ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("edit")}
          className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-surface-2"
        >
          <Pencil className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="kashi-btn inline-flex h-10 items-center gap-2 bg-accent px-4 text-sm font-bold text-accent-fg"
        >
          <Plus className="size-4" />
          {t("add")}
        </button>
      )}
      {open ? (
        <Sheet title={entry ? t("edit") : t("add")} onClose={() => setOpen(false)}>
          <SpanFields members={members} value={v} onChange={setV} optionalEnd />
          {error ? (
            <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
          ) : null}
          <div className="mt-4 flex gap-2">
            {entry ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => deleteEntryAction(rid, entry.id),
                    () => setOpen(false),
                  )
                }
                className="h-11 rounded-xl px-4 font-semibold text-danger ring-1 [--kashi-frame-color:color-mix(in_oklab,var(--danger)_35%,transparent)]"
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              disabled={pending || !v.userId}
              onClick={() =>
                run(
                  () => saveEntryAction(rid, entry?.id ?? null, { ...v, end: v.end || null }),
                  () => setOpen(false),
                )
              }
              className="h-11 flex-1 rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-50"
            >
              {tc("save")}
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

/** A shift in the planning grid (tap to remove) and the "+" of a day cell. */
export function ShiftChip({
  rid,
  id,
  label,
  note,
}: {
  rid: string;
  id: string;
  label: string;
  note: string | null;
}) {
  const t = useTranslations("staff.planning");
  const { pending, run } = useRun();
  return (
    <button
      type="button"
      disabled={pending}
      title={t("remove")}
      onClick={() => {
        if (confirm(t("removeConfirm"))) run(() => deleteShiftAction(rid, id));
      }}
      className="block w-full rounded-lg bg-accent-soft px-1.5 py-1 text-start text-[11px] font-semibold text-accent-text hover:bg-danger-soft hover:text-danger"
    >
      <span dir="ltr" className="block tabular-nums">
        {label}
      </span>
      {note ? <span className="block truncate font-normal opacity-80">{note}</span> : null}
    </button>
  );
}

export function AddShiftButton({
  rid,
  members,
  day,
  userId,
  compact,
}: {
  rid: string;
  members: Member[];
  day: string;
  userId?: string;
  compact?: boolean;
}) {
  const t = useTranslations("staff.planning");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRun();
  const [v, setV] = useState({
    userId: userId ?? members[0]?.userId ?? "",
    day,
    start: "10:00",
    end: "18:00",
    note: "",
  });
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("add")}
        className={
          compact
            ? "grid h-7 w-full place-items-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg"
            : "kashi-btn inline-flex h-10 items-center gap-2 bg-accent px-4 text-sm font-bold text-accent-fg"
        }
      >
        <Plus className="size-4" />
        {compact ? null : t("add")}
      </button>
      {open ? (
        <Sheet title={t("add")} onClose={() => setOpen(false)}>
          <SpanFields members={members} value={v} onChange={setV} />
          {error ? (
            <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
          ) : null}
          <button
            type="button"
            disabled={pending || !v.userId || !v.end}
            onClick={() =>
              run(
                () => addShiftAction(rid, v),
                () => setOpen(false),
              )
            }
            className="mt-4 h-11 w-full rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-50"
          >
            {tc("save")}
          </button>
        </Sheet>
      ) : null}
    </>
  );
}

export function CopyWeekButton({ rid, weekStart }: { rid: string; weekStart: string }) {
  const t = useTranslations("staff.planning");
  const { pending, error, run } = useRun();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => copyWeekAction(rid, weekStart))}
        className="kashi-btn kashi-frame inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold disabled:opacity-50"
      >
        <Copy className="size-4" />
        {t("copyWeek")}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

/** Hourly pay of one member, saved on blur. */
export function RateInput({
  rid,
  userId,
  cents,
  currency,
}: {
  rid: string;
  userId: string;
  cents: number | null;
  currency: string;
}) {
  const locale = useLocale();
  const { pending, error, run } = useRun();
  const shown = cents != null ? formatMoney(cents, currency, locale).replace(/[^\d٠-٩۰-۹,٬.]/g, "") : "";
  const [v, setV] = useState(shown);
  return (
    <span className="inline-flex items-center gap-1">
      <input
        inputMode="numeric"
        dir="ltr"
        value={v}
        disabled={pending}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v === shown) return;
          const c = v.trim() ? parseMoneyInput(v, currency) : null;
          run(() => setRateAction(rid, userId, c));
        }}
        className={cn(
          "h-9 w-28 rounded-lg border border-border bg-surface px-2 text-end text-sm tabular-nums",
          error && "border-danger",
        )}
      />
    </span>
  );
}

export function TipsForm({ rid, today, currency }: { rid: string; today: string; currency: string }) {
  const t = useTranslations("staff.tips");
  const { pending, error, run } = useRun();
  const [day, setDay] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const cents = parseMoneyInput(amount, currency);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium">
          {t("day")}
          <DateInput className="mt-1 w-40" value={day} onChange={setDay} />
        </label>
        <label className="text-sm font-medium">
          {t("amount")}
          <input
            inputMode="numeric"
            dir="ltr"
            className={cn(field, "mt-1 w-40")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <input
          className={cn(field, "w-48")}
          placeholder={t("note")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          disabled={pending || !cents}
          onClick={() =>
            run(
              () => addTipsAction(rid, { day, amountCents: cents!, note }),
              () => {
                setAmount("");
                setNote("");
              },
            )
          }
          className="h-11 rounded-xl bg-accent px-4 font-bold text-accent-fg disabled:opacity-50"
        >
          {t("add")}
        </button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

export function DeleteTipsButton({ rid, id }: { rid: string; id: string }) {
  const { pending, run } = useRun();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => deleteTipsAction(rid, id))}
      className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-danger-soft hover:text-danger"
      aria-label="×"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

export function ElapsedSince({ since }: { since: string }) {
  const e = useElapsed(since);
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" dir="ltr">
      <Clock className="size-3.5" aria-hidden="true" />
      {e}
    </span>
  );
}
