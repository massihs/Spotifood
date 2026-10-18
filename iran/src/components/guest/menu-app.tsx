"use client";

import { Search, ShoppingBag, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { addToCartAction } from "@/app/[locale]/table/actions";
import { Toast } from "@/components/ui/toast";
import { useMoney } from "@/components/ui/use-money";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { CategoryIcon } from "@/components/category-icon";
import type { PublicMenu, PublicProduct } from "@/server/modules/menu/public";
import { AddButton, canQuickAdd, initialSelection, Price, ProductImage, type CartSummary } from "./parts";
import { ProductSheet } from "./product-sheet";

export type { CartSummary };
export { useMoney };

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Inactive category tiles cycle through soft tones so the strip is colorful. */
const TILE_TONES = [
  "bg-tone-orange/12 text-tone-orange",
  "bg-tone-emerald/12 text-tone-emerald",
  "bg-tone-amber/18 text-tone-amber",
  "bg-tone-rose/12 text-tone-rose",
  "bg-tone-sky/12 text-tone-sky",
  "bg-tone-fuchsia/12 text-tone-fuchsia",
  "bg-tone-teal/12 text-tone-teal",
  "bg-tone-violet/12 text-tone-violet",
];

export function MenuApp({
  menu,
  currency,
  initialCart,
  header,
}: {
  menu: PublicMenu;
  currency: string;
  initialCart: CartSummary;
  header: ReactNode;
}) {
  const t = useTranslations();
  const money = useMoney(currency);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [cart, setCart] = useState(initialCart);
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);
  const [active, setActive] = useState<string | null>(menu.categories[0]?.id ?? null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const q = normalize(query.trim());
  const matches = useCallback(
    (p: PublicProduct) =>
      !q || normalize(`${p.name} ${p.description ?? ""} ${p.ingredients ?? ""}`).includes(q),
    [q],
  );
  const sections = useMemo(
    () =>
      menu.categories
        .map((c) => ({ ...c, items: c.productIds.map((id) => menu.products[id]!).filter(matches) }))
        .filter((c) => c.items.length > 0),
    [menu, matches],
  );
  const featured = useMemo(
    () => (q ? [] : Object.values(menu.products).filter((p) => p.isFeatured)),
    [menu, q],
  );

  // Scroll-spy: highlight the category currently on screen.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.getAttribute("data-category"));
      },
      { rootMargin: "-200px 0px -60% 0px" },
    );
    document.querySelectorAll("[data-category]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    const tab = tabsRef.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    tab?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

  /** Tap on "+": products whose defaults are enough go straight to the cart, others open. */
  const quickAdd = (p: PublicProduct) => {
    if (!canQuickAdd(p)) return setOpenId(p.id);
    setAdding(p.id);
    startTransition(async () => {
      const optionValueIds = [...initialSelection(p.optionGroups).values()].flatMap((s) => [...s]);
      const res = await addToCartAction({ productId: p.id, optionValueIds, quantity: 1, note: "" });
      setAdding(null);
      if (res?.ok && res.data) {
        setCart(res.data);
        setToast(t("guest.added"));
      } else setOpenId(p.id);
    });
  };

  const open = openId ? menu.products[openId] : null;

  return (
    <>
      {header}
      <div className="mx-auto max-w-3xl">
        <div className="sticky top-0 z-20 mt-3 bg-bg/90 pt-3 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/80">
          <div className="px-4">
            <label className="relative block">
              <span className="sr-only">{t("guest.search")}</span>
              <Search
                className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("guest.search")}
                enterKeyHint="search"
                className="h-12 w-full rounded-2xl border border-border bg-surface ps-11 pe-11 text-[16px] shadow-[var(--shadow-soft)] placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("common.clear")}
                  className="absolute end-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-surface-2 text-fg"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </label>
          </div>
          {!q ? (
            <nav aria-label={t("guest.categoriesNav")} className="mt-3 border-b border-border">
              <div ref={tabsRef} className="no-scrollbar flex gap-1 overflow-x-auto px-3">
                {menu.categories.map((c, ci) => (
                  <a
                    key={c.id}
                    href={`#c-${c.id}`}
                    data-chip={c.id}
                    aria-current={active === c.id ? "true" : undefined}
                    onClick={() => setActive(c.id)}
                    className={cn(
                      "group relative flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 pt-0.5 pb-3 text-center transition-colors",
                      "after:absolute after:inset-x-4 after:bottom-0 after:h-[3px] after:rounded-full after:transition-colors",
                      active === c.id
                        ? "text-fg after:bg-accent"
                        : "text-fg-muted after:bg-transparent hover:text-fg",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-14 place-items-center rounded-2xl transition-all",
                        active === c.id
                          ? "bg-accent text-accent-fg shadow-accent"
                          : cn(
                              "ring-1 ring-black/[0.03] group-hover:scale-105",
                              TILE_TONES[ci % TILE_TONES.length],
                            ),
                      )}
                    >
                      <CategoryIcon icon={c.icon} className="size-6" />
                    </span>
                    <span className="line-clamp-1 w-full text-xs font-semibold">{c.name}</span>
                  </a>
                ))}
              </div>
            </nav>
          ) : (
            <div className="h-3 border-b border-border" />
          )}
        </div>

        <main className="pb-36">
          {featured.length > 0 ? (
            <section className="pt-6" aria-labelledby="featured-title">
              <div className="flex items-center gap-2 px-4">
                <Sparkles className="size-5 text-accent" aria-hidden="true" />
                <h2 id="featured-title" className="text-lg font-bold tracking-tight">
                  {t("guest.featured")}
                </h2>
              </div>
              <ul className="no-scrollbar mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3">
                {featured.map((p) => (
                  <li key={p.id} className="w-[72%] max-w-72 shrink-0 snap-start">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenId(p.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpenId(p.id)}
                      className="block h-full w-full cursor-pointer overflow-hidden rounded-3xl border border-border bg-surface text-start shadow-[var(--shadow-soft)] transition-transform active:scale-[0.985]"
                    >
                      <ProductImage
                        product={p}
                        size="md"
                        className={cn("aspect-[4/3] w-full", !p.isAvailable && "grayscale")}
                        eager
                      />
                      <div className="flex items-end justify-between gap-2 p-3.5">
                        <div className="min-w-0">
                          <p className="truncate font-bold">{p.name}</p>
                          <Price product={p} money={money} className="mt-1" />
                        </div>
                        {p.isAvailable ? (
                          <AddButton
                            label={t("guest.quickAdd", { name: p.name })}
                            busy={adding === p.id}
                            onClick={() => quickAdd(p)}
                          />
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {sections.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-surface-2">
                <Search className="size-6 text-fg-muted" aria-hidden="true" />
              </div>
              <p className="mt-4 font-semibold">{t("guest.noResults", { q: query.trim() })}</p>
            </div>
          ) : (
            sections.map((c, ci) => (
              <section
                key={c.id}
                id={`c-${c.id}`}
                data-category={c.id}
                className="scroll-mt-48 pt-8"
                aria-labelledby={`h-${c.id}`}
              >
                <div className="flex items-center gap-3 px-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
                    <CategoryIcon icon={c.icon} className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 id={`h-${c.id}`} className="text-lg leading-tight font-bold tracking-tight">
                      {c.name}
                    </h2>
                    <p className="text-xs text-fg-subtle">{t("guest.items", { count: c.items.length })}</p>
                  </div>
                </div>
                {c.description ? <p className="mt-2 px-4 text-sm text-fg-muted">{c.description}</p> : null}
                <ul className="mt-3 grid gap-3 px-4 sm:grid-cols-2">
                  {c.items.map((p, pi) => (
                    <li key={p.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setOpenId(p.id)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpenId(p.id)}
                        className={cn(
                          "flex h-full w-full cursor-pointer gap-3 rounded-2xl border border-border bg-surface p-3 text-start shadow-[var(--shadow-soft)] transition-[transform,border-color] hover:border-border-strong active:scale-[0.99]",
                          !p.isAvailable && "opacity-60",
                        )}
                      >
                        {/* Text first: in Persian it sits on the right, the photo on the left. */}
                        <div className="flex min-w-0 flex-1 flex-col py-0.5">
                          <p className="line-clamp-2 leading-snug font-bold">{p.name}</p>
                          {p.description ? (
                            <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-fg-muted">
                              {p.description}
                            </p>
                          ) : null}
                          <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
                            <Price product={p} money={money} />
                            {!p.images[0] && p.isAvailable ? (
                              <AddButton
                                label={t("guest.quickAdd", { name: p.name })}
                                busy={adding === p.id}
                                onClick={() => quickAdd(p)}
                              />
                            ) : null}
                          </div>
                        </div>
                        {p.images[0] ? (
                          <div className="relative shrink-0">
                            <ProductImage
                              product={p}
                              size="sm"
                              className={cn("size-28 rounded-xl", !p.isAvailable && "grayscale")}
                              eager={ci === 0 && pi < 4}
                            />
                            {p.isAvailable ? (
                              <AddButton
                                label={t("guest.quickAdd", { name: p.name })}
                                busy={adding === p.id}
                                onClick={() => quickAdd(p)}
                                className="absolute -end-1.5 -bottom-1.5"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </main>
      </div>

      {cart.itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link
            key={cart.itemCount}
            href="/table/cart"
            className="animate-pop-in flex h-14 items-center gap-3 rounded-full bg-accent ps-2 pe-5 font-semibold text-accent-fg shadow-[var(--shadow-float)] transition-transform active:scale-[0.98]"
          >
            <span className="relative grid size-10 place-items-center rounded-full bg-accent text-accent-fg">
              <ShoppingBag className="size-5" aria-hidden="true" />
              <span className="absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-white px-1 text-xs leading-5 font-bold text-accent-text tabular-nums">
                {cart.itemCount}
              </span>
            </span>
            <span className="flex-1">{t("guest.viewCart")}</span>
            <span className="tabular-nums">{money(cart.totalCents)}</span>
          </Link>
        </div>
      ) : null}

      {open ? (
        <ProductSheet
          product={open}
          currency={currency}
          onClose={() => setOpenId(null)}
          onAdded={(summary) => {
            setCart(summary);
            setOpenId(null);
            setToast(t("guest.added"));
          }}
        />
      ) : null}
      <Toast
        message={toast}
        onDone={clearToast}
        duration={2200}
        className="bottom-[calc(5.5rem+env(safe-area-inset-bottom))]"
      />
    </>
  );
}

export { ProductImage };
