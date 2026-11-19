"use client";

import { RefreshCw, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { field, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import {
  retryMoadianAction,
  saveMoadianAction,
  syncMoadianAction,
} from "@/app/[locale]/dashboard/[restaurantId]/accounting/actions";

type View = {
  enabled: boolean;
  mode: "direct" | "provider";
  sandbox: boolean;
  memoryId: string;
  sellerId: string;
  serviceId: string;
  unitCode: string;
  hasKey: boolean;
  hasCert: boolean;
};

/** The tax system settings: identifiers, sending mode, key and certificate (never shown back). */
export function MoadianForm({ rid, initial, canManage }: { rid: string; initial: View; canManage: boolean }) {
  const t = useTranslations("moadian.form");
  const { pending, error, run } = useRun();
  const [v, setV] = useState({ ...initial, privateKey: "", certificate: "" });
  const [saved, setSaved] = useState(false);
  const set = (p: Partial<typeof v>) => (setV({ ...v, ...p }), setSaved(false));
  const input = (k: "memoryId" | "sellerId" | "serviceId" | "unitCode", hint?: string) => (
    <label className="block text-sm font-medium">
      {t(k)}
      <input
        dir="ltr"
        className={cn(field, "latin-digits mt-1")}
        value={v[k]}
        disabled={!canManage}
        onChange={(e) => set({ [k]: e.target.value } as Partial<typeof v>)}
      />
      {hint ? <span className="mt-1 block text-xs font-normal text-fg-muted">{hint}</span> : null}
    </label>
  );
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <label className="flex items-center gap-3 font-semibold">
        <input
          type="checkbox"
          className="size-5 accent-[var(--accent)]"
          checked={v.enabled}
          disabled={!canManage}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        {t("enabled")}
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["provider", "direct"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={!canManage}
            onClick={() => set({ mode: m })}
            className={cn(
              "rounded-xl p-3 text-start ring-1",
              v.mode === m ? "bg-accent-soft ring-accent" : "ring-border",
            )}
          >
            <span className="block text-sm font-bold">{t(`modes.${m}.title`)}</span>
            <span className="block text-xs text-fg-muted">{t(`modes.${m}.hint`)}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {input("memoryId", t("memoryIdHint"))}
        {input("sellerId", t("sellerIdHint"))}
        {input("serviceId", t("serviceIdHint"))}
        {input("unitCode", t("unitCodeHint"))}
      </div>
      {v.mode === "direct" ? (
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            {t("privateKey")} {initial.hasKey ? <span className="text-success">✓ {t("saved")}</span> : null}
            <textarea
              dir="ltr"
              rows={4}
              className={cn(field, "latin-digits mt-1 h-auto py-2 font-mono text-xs")}
              placeholder="-----BEGIN PRIVATE KEY-----"
              value={v.privateKey}
              disabled={!canManage}
              onChange={(e) => set({ privateKey: e.target.value })}
            />
          </label>
          <label className="block text-sm font-medium">
            {t("certificate")} {initial.hasCert ? <span className="text-success">✓ {t("saved")}</span> : null}
            <textarea
              dir="ltr"
              rows={3}
              className={cn(field, "latin-digits mt-1 h-auto py-2 font-mono text-xs")}
              placeholder="-----BEGIN CERTIFICATE-----"
              value={v.certificate}
              disabled={!canManage}
              onChange={(e) => set({ certificate: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={v.sandbox}
              disabled={!canManage}
              onChange={(e) => set({ sandbox: e.target.checked })}
            />
            {t("sandbox")}
          </label>
          <p className="text-xs text-fg-muted">{t("keyHint")}</p>
        </div>
      ) : null}
      {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      {canManage ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => saveMoadianAction(rid, v),
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

export function MoadianSyncButton({ rid }: { rid: string }) {
  const t = useTranslations("moadian");
  const { pending, error, run } = useRun();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => syncMoadianAction(rid))}
        className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-border disabled:opacity-50"
      >
        <RefreshCw className={cn("size-4", pending && "animate-spin")} />
        {t("syncNow")}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

export function MoadianRetryButton({ rid, id }: { rid: string; id: string }) {
  const t = useTranslations("moadian");
  const { pending, run } = useRun();
  return (
    <button
      type="button"
      disabled={pending}
      title={t("retry")}
      onClick={() => run(() => retryMoadianAction(rid, [id]))}
      className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-surface-2"
    >
      <RotateCcw className="size-4" />
    </button>
  );
}
