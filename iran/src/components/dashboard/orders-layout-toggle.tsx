"use client";

import { Columns3, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { ORDERS_LAYOUT_COOKIE } from "@/lib/orders-layout";

function remember(layout: "cards" | "board") {
  document.cookie = `${ORDERS_LAYOUT_COOKIE}=${layout}; path=/; max-age=31536000; samesite=lax`;
}

/** Cards (filtered by step) or columns (every step side by side); remembered on this device. */
export function OrdersLayoutToggle({
  layout,
  cardsHref,
  boardHref,
}: {
  layout: "cards" | "board";
  cardsHref: string;
  boardHref: string;
}) {
  const t = useTranslations("orders.layout");
  const router = useRouter();
  const pick = (next: "cards" | "board") => {
    remember(next);
    router.push(next === "board" ? boardHref : cardsHref);
  };
  return (
    <div className="flex shrink-0 gap-1 rounded-full bg-surface-2 p-1" role="group" aria-label={t("label")}>
      {(
        [
          ["cards", LayoutGrid],
          ["board", Columns3],
        ] as const
      ).map(([key, Icon]) => (
        <button
          key={key}
          type="button"
          aria-pressed={layout === key}
          onClick={() => pick(key)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold whitespace-nowrap",
            layout === key ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {t(key)}
        </button>
      ))}
    </div>
  );
}
