import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";

/** Building blocks of the report pages (server-rendered, no state). */

export function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="flex items-center gap-1 text-xs text-fg-muted">
        {tone === "good" ? <TrendingUp className="size-3.5 text-success" /> : null}
        {tone === "bad" ? <TrendingDown className="size-3.5 text-danger" /> : null}
        {label}
      </p>
      <p
        className={cn(
          "text-lg font-bold tabular-nums",
          tone === "good" && "text-success",
          tone === "bad" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export function Row({
  k,
  v,
  bold,
  muted,
  hint,
  tone,
}: {
  k: string;
  v: string;
  bold?: boolean;
  muted?: boolean;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 px-4 py-2",
        bold && "bg-surface-2/50 font-semibold",
      )}
    >
      <dt className={cn(muted && "text-fg-muted")}>
        {k}
        {hint ? <span className="ms-1 text-xs text-fg-subtle">({hint})</span> : null}
      </dt>
      <dd
        className={cn(
          "tabular-nums",
          muted && "text-fg-muted",
          tone === "good" && "text-success",
          tone === "bad" && "text-danger",
        )}
      >
        {v}
      </dd>
    </div>
  );
}

export function Bars({
  rows,
  format,
}: {
  rows: { label: string; value: number; hint?: string }[];
  format: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!rows.length) return <p className="py-6 text-center text-sm text-fg-muted">—</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate">
              {r.label}
              {r.hint ? <span className="ms-1.5 text-xs text-fg-subtle">×{r.hint}</span> : null}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {format(r.value)}
              <span className="ms-1.5 text-xs font-normal text-fg-subtle">
                {total ? Math.round((r.value / total) * 100) : 0}%
              </span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DailyChart({
  rows,
  money,
  day,
}: {
  rows: { day: string; orders: number; totalCents: number }[];
  money: (c: number) => string;
  day: (d: string) => string;
}) {
  if (!rows.length) return <p className="py-16 text-center text-sm text-fg-muted">—</p>;
  const max = Math.max(1, ...rows.map((r) => r.totalCents));
  return (
    <div className="flex h-48 items-end gap-1" dir="ltr">
      {rows.map((r) => (
        <div key={r.day} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
          <div
            className="rounded-t-md bg-accent/80 transition-colors group-hover:bg-accent"
            style={{ height: `${Math.max(2, (r.totalCents / max) * 100)}%` }}
            title={`${day(r.day)} · ${money(r.totalCents)} · ${r.orders}`}
          />
          {rows.length <= 14 ? (
            <span className="mt-1 truncate text-center text-[10px] text-fg-subtle">{day(r.day)}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function HourChart({ rows }: { rows: { hour: number; orders: number }[] }) {
  const by = new Map(rows.map((r) => [r.hour, r.orders]));
  const max = Math.max(1, ...rows.map((r) => r.orders));
  return (
    <div className="flex h-32 items-end gap-0.5" dir="ltr">
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          className="flex h-full flex-1 flex-col justify-end"
          title={`${h}:00 · ${by.get(h) ?? 0}`}
        >
          <div
            className={cn("rounded-t-sm", by.get(h) ? "bg-accent/80" : "bg-surface-2")}
            style={{ height: `${Math.max(3, ((by.get(h) ?? 0) / max) * 100)}%` }}
          />
          <span className="mt-1 text-center text-[9px] text-fg-subtle">{h % 3 === 0 ? h : ""}</span>
        </div>
      ))}
    </div>
  );
}
