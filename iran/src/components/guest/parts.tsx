"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PricedOptionGroup } from "@/server/modules/pricing";
import type { PublicProduct } from "@/server/modules/menu/public";
import { cn } from "@/lib/cn";

export type CartSummary = { itemCount: number; totalCents: number };

/** Default selections: each group's defaults that are still available, within its maximum. */
export function initialSelection(groups: PricedOptionGroup[]) {
  const m = new Map<string, Set<string>>();
  for (const g of groups) {
    const defaults = g.values.filter((v) => v.isDefault && v.isAvailable).slice(0, g.maxSelect);
    m.set(g.id, new Set(defaults.map((v) => v.id)));
  }
  return m;
}

/** A product can be added with one tap when its default choices already satisfy every group. */
export function canQuickAdd(p: PublicProduct) {
  if (!p.isAvailable) return false;
  const sel = initialSelection(p.optionGroups);
  return p.optionGroups.every((g) => (sel.get(g.id)?.size ?? 0) >= g.minSelect);
}

export function discountPct(p: PublicProduct) {
  if (!p.compareAtPriceCents || p.compareAtPriceCents <= p.priceCents) return 0;
  return Math.round((1 - p.priceCents / p.compareAtPriceCents) * 100);
}

export function ProductImage({
  product,
  size,
  className,
  eager,
}: {
  product: PublicProduct;
  size: "sm" | "md" | "lg";
  className?: string;
  eager?: boolean;
}) {
  const img = product.images[0];
  if (!img) return <div className={cn("bg-surface-2", className)} />;
  return (
    <img
      src={img[size]}
      srcSet={`${img.sm} 320w, ${img.md} 640w, ${img.lg} 1280w`}
      sizes={size === "sm" ? "112px" : size === "md" ? "256px" : "100vw"}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("bg-surface-2 bg-cover object-cover", className)}
      style={img.placeholder ? { backgroundImage: `url(${img.placeholder})` } : undefined}
    />
  );
}

export function Price({
  product: p,
  money,
  className,
}: {
  product: PublicProduct;
  money: (c: number) => string;
  className?: string;
}) {
  const t = useTranslations("guest");
  const pct = discountPct(p);
  return (
    <span className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]", className)}>
      <span className="font-bold text-fg tabular-nums">{money(p.priceCents)}</span>
      {pct ? (
        <>
          <s className="text-sm text-fg-subtle tabular-nums">{money(p.compareAtPriceCents!)}</s>
          <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-fg">
            {t("discount", { pct })}
          </span>
        </>
      ) : null}
      {!p.isAvailable ? (
        <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-xs font-semibold text-fg-muted">
          {t("soldOut")}
        </span>
      ) : null}
    </span>
  );
}

/** Round "+" button laid over a product photo (or inline when there is none). */
export function AddButton({
  label,
  onClick,
  busy,
  className,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={busy}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-fg shadow-accent ring-[3px] ring-surface",
        "transition-transform active:scale-90 disabled:opacity-60",
        className,
      )}
    >
      <Plus className={cn("size-5", busy && "animate-spin")} strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}

export function QuantityStepper({
  value,
  onChange,
  onRemove,
  min = 1,
  max = 99,
  disabled,
  size = "lg",
}: {
  value: number;
  onChange: (n: number) => void;
  /** When set, the "−" button becomes a bin at the minimum and removes the line. */
  onRemove?: () => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const t = useTranslations("guest");
  const removing = onRemove && value <= min;
  const btn = cn(
    "grid place-items-center rounded-full transition-colors active:bg-surface-3 disabled:opacity-30",
    size === "lg" ? "size-12" : "size-9",
  );
  return (
    <div
      className={cn("flex shrink-0 items-center rounded-full bg-surface-2", size === "lg" ? "h-12" : "h-9")}
      role="group"
      aria-label={t("quantity")}
    >
      <button
        type="button"
        aria-label={removing ? t("remove") : t("decrease")}
        disabled={disabled || (!removing && value <= min)}
        onClick={() => (removing ? onRemove() : onChange(value - 1))}
        className={btn}
      >
        {removing ? (
          <Trash2 className="size-4" aria-hidden="true" />
        ) : (
          <Minus className="size-4" strokeWidth={2.5} aria-hidden="true" />
        )}
      </button>
      <span
        className={cn("text-center font-bold tabular-nums", size === "lg" ? "w-7 text-base" : "w-5 text-sm")}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={t("increase")}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className={btn}
      >
        <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}
