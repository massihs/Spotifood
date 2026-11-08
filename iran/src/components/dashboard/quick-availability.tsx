"use client";

import { Ban, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  listAvailabilityAction,
  setProductFlagAction,
} from "@/app/[locale]/dashboard/[restaurantId]/menu/actions";
import { buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

type Dish = { id: string; name: string; category: string; isAvailable: boolean; image: string | null };

/** Search folding for Persian/Arabic letter variants and case. */
const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .toLowerCase();

/**
 * "Sold out" in one gesture during service: every dish with a switch, a search on top, the sold
 * out ones first. Opens from the overview's shortcuts and from the menu page.
 */
export function QuickAvailability({
  restaurantId,
  variant = "button",
}: {
  restaurantId: string;
  /** "chip": the overview's shortcut row; "button": a page header action. */
  variant?: "chip" | "button";
}) {
  const t = useTranslations("menu.availability");
  return (
    <Dialog
      title={t("title")}
      description={t("hint")}
      size="lg"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          className={
            variant === "chip"
              ? "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-surface ps-1.5 pe-3.5 text-sm font-semibold whitespace-nowrap shadow-[var(--shadow-soft)] transition-[border-color,background-color,transform] hover:border-accent/40 hover:bg-accent-soft/40 active:scale-[0.97]"
              : buttonClasses("secondary")
          }
        >
          {variant === "chip" ? (
            <span className="grid size-7 place-items-center rounded-full bg-danger-soft text-danger">
              <Ban className="size-4" aria-hidden="true" />
            </span>
          ) : (
            <Ban className="size-4" aria-hidden="true" />
          )}
          {t("open")}
        </button>
      )}
    >
      <AvailabilityList restaurantId={restaurantId} />
    </Dialog>
  );
}

function AvailabilityList({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("menu.availability");
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<Set<string>>(() => new Set());

  // Loaded when the sheet opens (it is mounted then), not with every page.
  useEffect(() => {
    let alive = true;
    listAvailabilityAction(restaurantId).then((res) => {
      if (!alive) return;
      if (res?.ok && res.data) setDishes(res.data);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  const shown = useMemo(() => {
    const q = fold(query.trim());
    const list = (dishes ?? []).filter((d) => !q || fold(`${d.name} ${d.category}`).includes(q));
    // Sold out first: what to switch back on is in sight.
    return [...list.filter((d) => !d.isAvailable), ...list.filter((d) => d.isAvailable)];
  }, [dishes, query]);
  const soldOut = (dishes ?? []).filter((d) => !d.isAvailable).length;

  const toggle = async (d: Dish) => {
    const next = !d.isAvailable;
    setBusy((b) => new Set(b).add(d.id));
    setDishes((list) => list?.map((x) => (x.id === d.id ? { ...x, isAvailable: next } : x)) ?? null);
    const res = await setProductFlagAction(restaurantId, d.id, "isAvailable", next).catch(() => null);
    if (!res?.ok)
      setDishes((list) => list?.map((x) => (x.id === d.id ? { ...x, isAvailable: !next } : x)) ?? null);
    setBusy((b) => {
      const n = new Set(b);
      n.delete(d.id);
      return n;
    });
  };

  if (failed) return <p className="py-6 text-center text-sm text-danger">{t("error")}</p>;
  if (!dishes)
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
    );
  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">{t("search")}</span>
        <Search
          className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="h-11 w-full rounded-2xl border border-border bg-surface ps-10 pe-3 text-[15px] focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
        />
      </label>
      <p className="text-xs font-semibold text-fg-muted">
        {soldOut ? t("soldOutCount", { n: soldOut }) : t("allAvailable")}
      </p>
      <ul className="max-h-[55dvh] divide-y divide-border overflow-y-auto overscroll-contain rounded-2xl ring-1 ring-border">
        {shown.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
            {d.image ? (
              <img
                src={d.image}
                alt=""
                className={cn("size-11 shrink-0 rounded-xl object-cover", !d.isAvailable && "grayscale")}
              />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-subtle">
                <Ban className="size-4" aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-sm font-semibold", !d.isAvailable && "text-fg-muted")}>
                {d.name}
              </span>
              <span className="block truncate text-xs text-fg-subtle">{d.category}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={d.isAvailable}
              aria-label={t("toggle", { name: d.name })}
              disabled={busy.has(d.id)}
              onClick={() => toggle(d)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors disabled:opacity-60",
                d.isAvailable ? "bg-success-soft text-success" : "bg-danger text-white",
              )}
            >
              <span
                className={cn("size-2 rounded-full", d.isAvailable ? "bg-success" : "bg-white")}
                aria-hidden="true"
              />
              {d.isAvailable ? t("available") : t("soldOut")}
            </button>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-fg-muted">{t("none")}</li>
        ) : null}
      </ul>
    </div>
  );
}
