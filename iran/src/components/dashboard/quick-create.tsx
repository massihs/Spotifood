"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export type QuickCreateItem = {
  key: string;
  href: string;
  label: string;
  hint: string;
  icon: ReactNode;
  tone: string;
};

/**
 * "+ Create" in the dashboard's top bar: a sale, a booking, a dish, a customer, an expense…
 * one tap away from any page, each opening its form directly. Only what the person may do.
 */
export function QuickCreate({ items }: { items: QuickCreateItem[] }) {
  const t = useTranslations("dashboard.create");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent ps-3 pe-3 text-sm font-bold text-accent-fg shadow-[var(--shadow-soft)] transition-transform active:scale-95 sm:pe-4"
      >
        <Plus className={cn("size-5 transition-transform", open && "rotate-45")} aria-hidden="true" />
        <span className="max-sm:sr-only">{t("button")}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="animate-pop-in absolute end-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-3xl border border-border bg-surface p-2 shadow-[var(--shadow-float)]"
        >
          <p className="px-3 pt-2 pb-1 text-xs font-semibold text-fg-muted">{t("title")}</p>
          <ul className="grid grid-cols-2 gap-1">
            {items.map((i) => (
              <li key={i.key}>
                <Link
                  role="menuitem"
                  href={i.href}
                  onClick={() => setOpen(false)}
                  className="flex h-full flex-col gap-2 rounded-2xl p-3 transition-colors hover:bg-surface-2"
                >
                  <span
                    className={cn("grid size-9 place-items-center rounded-xl [&_svg]:size-[18px]", i.tone)}
                  >
                    {i.icon}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{i.label}</span>
                    <span className="block text-[11px] leading-4 text-fg-muted">{i.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
