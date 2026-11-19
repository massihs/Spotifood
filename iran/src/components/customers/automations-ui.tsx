"use client";

import { Cake, HeartHandshake, Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { field, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import {
  announceDishAction,
  saveAutomationsAction,
} from "@/app/[locale]/dashboard/[restaurantId]/customers/actions";

type Settings = {
  birthday: { enabled: boolean; text: string };
  winback: { enabled: boolean; days: number; text: string };
};

/** Birthday and win-back texts: on/off, delay, wording (empty = the default text). */
export function AutomationsForm({
  rid,
  initial,
  defaults,
  canManage,
}: {
  rid: string;
  initial: Settings;
  defaults: { birthday: string; winback: string };
  canManage: boolean;
}) {
  const t = useTranslations("automations");
  const { pending, error, run } = useRun();
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const set = (next: Settings) => {
    setV(next);
    setSaved(false);
  };
  const block = (key: "birthday" | "winback", icon: React.ReactNode, extra?: React.ReactNode) => (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t(`${key}.title`)}</p>
          <p className="text-sm text-fg-muted">{t(`${key}.hint`)}</p>
        </div>
        <input
          type="checkbox"
          aria-label={t(`${key}.title`)}
          className="mt-1 size-5 accent-[var(--accent)]"
          checked={v[key].enabled}
          disabled={!canManage}
          onChange={(e) => set({ ...v, [key]: { ...v[key], enabled: e.target.checked } })}
        />
      </div>
      {extra}
      <textarea
        rows={3}
        maxLength={300}
        disabled={!canManage || !v[key].enabled}
        placeholder={defaults[key]}
        value={v[key].text}
        onChange={(e) => set({ ...v, [key]: { ...v[key], text: e.target.value } })}
        className={cn(field, "h-auto py-2 text-sm")}
      />
      <p className="text-xs text-fg-muted">{t("variables")}</p>
    </div>
  );
  return (
    <div className="space-y-3">
      {block("birthday", <Cake className="size-5" />)}
      {block(
        "winback",
        <HeartHandshake className="size-5" />,
        <label className="flex items-center gap-2 text-sm">
          {t("winback.after")}
          <select
            className={cn(field, "h-9 w-24")}
            value={v.winback.days}
            disabled={!canManage || !v.winback.enabled}
            onChange={(e) => set({ ...v, winback: { ...v.winback, days: Number(e.target.value) } })}
          >
            {[14, 21, 30, 45, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {t("winback.days")}
        </label>,
      )}
      {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      {canManage ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => saveAutomationsAction(rid, v),
              () => setSaved(true),
            )
          }
          className="h-11 rounded-xl bg-accent px-5 font-bold text-accent-fg disabled:opacity-50"
        >
          {saved ? "✓" : t("save")}
        </button>
      ) : null}
    </div>
  );
}

/** A new dish told to the regulars (ordered in the last 90 days). */
export function AnnounceDish({
  rid,
  dishes,
  defaultText,
}: {
  rid: string;
  dishes: { id: string; name: string }[];
  defaultText: string;
}) {
  const t = useTranslations("automations.newDish");
  const { pending, error, run } = useRun();
  const [dish, setDish] = useState(dishes[0]?.id ?? "");
  const [text, setText] = useState("");
  const [done, setDone] = useState<{ sent: number; recipients: number } | null>(null);
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
          <Megaphone className="size-5" />
        </span>
        <div>
          <p className="font-semibold">{t("title")}</p>
          <p className="text-sm text-fg-muted">{t("hint")}</p>
        </div>
      </div>
      <select className={field} value={dish} onChange={(e) => setDish(e.target.value)}>
        {dishes.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <textarea
        rows={3}
        maxLength={300}
        placeholder={defaultText}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={cn(field, "h-auto py-2 text-sm")}
      />
      {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      {done ? (
        <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
          {t("done", { sent: done.sent, total: done.recipients })}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending || !dish}
        onClick={() =>
          run(async () => {
            const r = await announceDishAction(rid, dish, text);
            if (r && r.ok && r.data) setDone(r.data);
            return r;
          })
        }
        className="h-11 rounded-xl bg-accent px-5 font-bold text-accent-fg disabled:opacity-50"
      >
        {t("send")}
      </button>
    </div>
  );
}
