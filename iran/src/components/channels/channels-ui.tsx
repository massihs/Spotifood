"use client";

import { Bot, Copy, Globe, KeyRound, Plus, Trash2, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { field, Sheet, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import {
  connectBotAction,
  createPlatformOrderAction,
  disconnectBotAction,
  regenerateApiKeyAction,
  saveCommissionsAction,
  setDomainAction,
} from "@/app/[locale]/dashboard/[restaurantId]/settings/channels-actions";

const box = "space-y-3 rounded-2xl border border-border bg-surface p-4";
const btn = "h-11 rounded-xl bg-accent px-4 font-bold text-accent-fg disabled:opacity-50";
const ghost = "h-11 rounded-xl px-4 font-semibold ring-1 ring-border disabled:opacity-50";

function Head({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
        {icon}
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-fg-muted">{hint}</p>
      </div>
    </div>
  );
}

function CopyLine({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
      <code dir="ltr" className="latin-digits min-w-0 flex-1 truncate text-xs">
        {value}
      </code>
      <button
        type="button"
        aria-label="copy"
        onClick={() => navigator.clipboard?.writeText(value).then(() => setDone(true))}
        className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-surface"
      >
        {done ? "✓" : <Copy className="size-4" />}
      </button>
    </div>
  );
}

/** The restaurant's own domain for its ordering site, and what ordering direct saved. */
export function DomainPanel({
  rid,
  domain,
  appHost,
  savings,
  disabled,
}: {
  rid: string;
  domain: string | null;
  appHost: string;
  savings: { orders: number; total: string; saved: string; pct: number };
  disabled: boolean;
}) {
  const t = useTranslations("channels.domain");
  const { pending, error, run } = useRun();
  const [v, setV] = useState(domain ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <div className={box}>
      <Head icon={<Globe className="size-5" />} title={t("title")} hint={t("hint")} />
      <div className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
        {t("savings", {
          orders: savings.orders,
          total: savings.total,
          saved: savings.saved,
          pct: savings.pct,
        })}
      </div>
      <div className="flex gap-2">
        <input
          dir="ltr"
          className={cn(field, "latin-digits")}
          placeholder="order.myrestaurant.ir"
          value={v}
          disabled={disabled}
          onChange={(e) => (setV(e.target.value), setSaved(false))}
        />
        <button
          type="button"
          disabled={disabled || pending}
          className={btn}
          onClick={() =>
            run(
              () => setDomainAction(rid, v),
              () => setSaved(true),
            )
          }
        >
          {saved ? "✓" : t("save")}
        </button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ol className="list-decimal space-y-1 ps-5 text-xs text-fg-muted">
        <li>{t("step1")}</li>
        <li>{t("step2", { host: appHost })}</li>
        <li>{t("step3")}</li>
      </ol>
    </div>
  );
}

/** The ordering bot on Bale or Telegram. */
export function BotPanel({
  rid,
  status,
  disabled,
}: {
  rid: string;
  status: { provider: string; username: string | null } | null;
  disabled: boolean;
}) {
  const t = useTranslations("channels.bot");
  const { pending, error, run } = useRun();
  const [provider, setProvider] = useState<"bale" | "telegram">("bale");
  const [token, setToken] = useState("");
  return (
    <div className={box}>
      <Head icon={<Bot className="size-5" />} title={t("title")} hint={t("hint")} />
      {status ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">
            {t("connected", { provider: t(`providers.${status.provider}`) })}
          </span>
          {status.username ? (
            <span dir="ltr" className="latin-digits text-sm font-semibold">
              @{status.username}
            </span>
          ) : null}
          <button
            type="button"
            disabled={disabled || pending}
            className="ms-auto text-sm font-semibold text-danger"
            onClick={() => run(() => disconnectBotAction(rid))}
          >
            {t("disconnect")}
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            {(["bale", "telegram"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-semibold",
                  provider === p ? "bg-fg text-bg" : "ring-1 ring-border",
                )}
              >
                {t(`providers.${p}`)}
              </button>
            ))}
          </div>
          <ol className="list-decimal space-y-1 ps-5 text-xs text-fg-muted">
            <li>{t(`step1.${provider}`)}</li>
            <li>{t("step2")}</li>
          </ol>
          <div className="flex gap-2">
            <input
              dir="ltr"
              className={cn(field, "latin-digits")}
              placeholder="123456789:AA…"
              value={token}
              disabled={disabled}
              onChange={(e) => setToken(e.target.value)}
            />
            <button
              type="button"
              disabled={disabled || pending || token.length < 20}
              className={btn}
              onClick={() =>
                run(
                  () => connectBotAction(rid, { provider, token }),
                  () => setToken(""),
                )
              }
            >
              {t("connect")}
            </button>
          </div>
        </>
      )}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

/** Delivery platforms: their commission, and the key and address of an integration. */
export function PlatformsPanel({
  rid,
  commissions,
  hasKey,
  endpoint,
  disabled,
}: {
  rid: string;
  commissions: Record<string, number>;
  hasKey: boolean;
  endpoint: string;
  disabled: boolean;
}) {
  const t = useTranslations("channels.platforms");
  const { pending, error, run } = useRun();
  const [c, setC] = useState(
    Object.fromEntries(Object.entries(commissions).map(([k, v]) => [k, String(v / 100)])),
  );
  const [key, setKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <div className={box}>
      <Head icon={<Truck className="size-5" />} title={t("title")} hint={t("hint")} />
      <div className="grid grid-cols-3 gap-2">
        {Object.keys(commissions).map((p) => (
          <label key={p} className="text-sm font-medium">
            {t(`names.${p}`)}
            <span className="mt-1 flex items-center gap-1">
              <input
                inputMode="decimal"
                dir="ltr"
                className={cn(field, "h-10")}
                value={c[p]}
                disabled={disabled}
                onChange={(e) => (setC({ ...c, [p]: e.target.value }), setSaved(false))}
              />
              %
            </span>
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled || pending}
        className={ghost}
        onClick={() =>
          run(
            () =>
              saveCommissionsAction(
                rid,
                Object.fromEntries(
                  Object.entries(c).map(([k, v]) => [k, Math.round(Number(v.replace(",", ".")) * 100) || 0]),
                ),
              ),
            () => setSaved(true),
          )
        }
      >
        {saved ? "✓" : t("saveCommissions")}
      </button>
      <div className="space-y-2 border-t border-border pt-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4" />
          {t("integration")}
        </p>
        <p className="text-xs text-fg-muted">{t("integrationHint")}</p>
        <CopyLine value={endpoint} />
        {key ? (
          <>
            <CopyLine value={key} />
            <p className="text-xs text-warning">{t("keyOnce")}</p>
          </>
        ) : null}
        <button
          type="button"
          disabled={disabled || pending}
          className={ghost}
          onClick={() =>
            run(async () => {
              const r = await regenerateApiKeyAction(rid);
              if (r?.ok && r.data) setKey(r.data.key);
              return r;
            })
          }
        >
          {hasKey || key ? t("newKey") : t("createKey")}
        </button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

type Dish = { id: string; name: string };

/** A platform order typed in from its tablet: to the kitchen in a few taps, paid by the platform. */
export function PlatformOrderButton({ rid, dishes }: { rid: string; dishes: Dish[] }) {
  const t = useTranslations("channels.entry");
  const tp = useTranslations("channels.platforms.names");
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRun();
  const [platform, setPlatform] = useState<"snappfood" | "tapsifood" | "other">("snappfood");
  const [ref, setRef] = useState("");
  const [name, setName] = useState("");
  const [lines, setLines] = useState([{ productId: dishes[0]?.id ?? "", quantity: 1 }]);
  const [done, setDone] = useState<string | null>(null);
  const reset = () => {
    setRef("");
    setName("");
    setLines([{ productId: dishes[0]?.id ?? "", quantity: 1 }]);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => (setOpen(true), setDone(null))}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-accent-fg"
      >
        <Truck className="size-4" />
        {t("button")}
      </button>
      {open ? (
        <Sheet title={t("title")} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <div className="flex gap-2">
              {(["snappfood", "tapsifood", "other"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={cn(
                    "flex-1 rounded-xl py-2.5 text-sm font-bold",
                    platform === p ? "bg-fg text-bg" : "ring-1 ring-border",
                  )}
                >
                  {tp(p)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                dir="ltr"
                className={field}
                placeholder={t("ref")}
                value={ref}
                onChange={(e) => setRef(e.target.value)}
              />
              <input
                className={field}
                placeholder={t("customer")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className={cn(field, "min-w-0 flex-1")}
                  value={l.productId}
                  onChange={(e) =>
                    setLines(lines.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))
                  }
                >
                  {dishes.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <input
                  inputMode="numeric"
                  dir="ltr"
                  className={cn(field, "w-20 text-center")}
                  value={l.quantity}
                  onChange={(e) =>
                    setLines(
                      lines.map((x, j) =>
                        j === i
                          ? { ...x, quantity: Math.max(1, Math.min(99, Number(e.target.value) || 1)) }
                          : x,
                      ),
                    )
                  }
                />
                {lines.length > 1 ? (
                  <button
                    type="button"
                    aria-label="×"
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    className="grid size-11 place-items-center rounded-xl ring-1 ring-border"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setLines([...lines, { productId: dishes[0]?.id ?? "", quantity: 1 }])}
              className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text"
            >
              <Plus className="size-4" />
              {t("addLine")}
            </button>
            {error ? (
              <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
            ) : null}
            {done ? (
              <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
                {t("done", { number: done })}
              </p>
            ) : null}
            <button
              type="button"
              disabled={pending || !ref.trim() || !lines.every((l) => l.productId)}
              className={cn(btn, "w-full")}
              onClick={() =>
                run(async () => {
                  const r = await createPlatformOrderAction(rid, {
                    platform,
                    externalRef: ref.trim(),
                    customerName: name,
                    lines,
                  });
                  if (r?.ok && r.data) {
                    setDone(r.data.number);
                    reset();
                  }
                  return r;
                })
              }
            >
              {t("send")}
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
