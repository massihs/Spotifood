"use client";

import { ShoppingBag } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * The floating "view cart" bar at the bottom of the menus: number of items, label and total.
 * A link (table menu → cart page) or a button (online ordering → checkout sheet).
 */
export function CartBar({
  count,
  total,
  label,
  href,
  onClick,
}: {
  count: number;
  total: string;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="relative grid size-10 place-items-center rounded-full bg-black/10">
        <ShoppingBag className="size-5" aria-hidden="true" />
        <span className="absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-white px-1 text-xs leading-5 font-bold text-accent-text tabular-nums">
          {count}
        </span>
      </span>
      <span className="flex-1 text-start">{label}</span>
      <span className="tabular-nums">{total}</span>
    </>
  );
  const className = cn(
    "animate-pop-in flex h-14 w-full items-center gap-3 rounded-full bg-accent ps-2 pe-5 font-semibold text-accent-fg shadow-[var(--shadow-float)] transition-transform active:scale-[0.98] atelier:rounded-2xl",
  );
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {href ? (
        <Link key={count} href={href} className={className}>
          {body}
        </Link>
      ) : (
        <button key={count} type="button" onClick={onClick} className={className}>
          {body}
        </button>
      )}
    </div>
  );
}
