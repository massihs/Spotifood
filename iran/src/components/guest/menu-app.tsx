"use client";

import { LayoutGrid, LayoutList, Search, ShoppingBag, Sparkles, TrendingUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { addToCartAction } from "@/app/[locale]/table/actions";
import { Toast } from "@/components/ui/toast";
import { useMoney } from "@/components/ui/use-money";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { CategoryIcon } from "@/components/category-icon";
import type { PublicMenu, PublicProduct } from "@/server/modules/menu/public";
import {
  AddButton,
  canQuickAdd,
  DishPlaceholder,
  InCartBadge,
  initialSelection,
  PopularBadge,
  Price,
  ProductImage,
  TAG_META,
  TagChip,
  tagLabel,
  type CartSummary,
} from "./parts";
import { ProductSheet } from "./product-sheet";

export type { CartSummary };
export { useMoney };

/** Search folding: case, Latin accents, Arabic/Persian letter variants and diacritics. */
const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟ]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/‌/g, " ")
    .toLowerCase();

/** List or photo grid, remembered on this phone. */
const VIEW_KEY = "sf-menu-view";
const VIEW_EVENT = "sf-menu-view-change";
const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
};
const subscribeView = (cb: () => void) => {
  window.addEventListener(VIEW_EVENT, cb);
  return () => window.removeEventListener(VIEW_EVENT, cb);
};
const writeView = (v: "list" | "grid") => {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(VIEW_EVENT));
};

type Filter = "all" | "popular" | `tag:${string}`;

export function MenuApp({
  menu,
  currency,
  initialCart,
  popularIds,
  header,
}: {
  menu: PublicMenu;
  currency: string;
  initialCart: CartSummary;
  popularIds: string[];
  header: ReactNode;
}) {
  const t = useTranslations();
  const money = useMoney(currency);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [cart, setCart] = useState(initialCart);
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);
  const [active, setActive] = useState<string | null>(menu.categories[0]?.id ?? null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const view = useSyncExternalStore(subscribeView, readView, () => "list");

  const popular = useMemo(
    () => new Set(popularIds.filter((id) => menu.products[id]?.isAvailable)),
    [popularIds, menu],
  );
  const categoryIcon = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of menu.categories) for (const id of c.productIds) m.set(id, c.icon);
    return m;
  }, [menu]);

  // Filter chips: popular first, then the tags this menu actually uses (most common first).
  const tagFilters = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of Object.values(menu.products))
      for (const tag of p.tags) count.set(tag, (count.get(tag) ?? 0) + 1);
    return [...count.entries()]
      .filter(([tag]) => TAG_META[tag])
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [menu]);

  const q = normalize(query.trim());
  const matches = useCallback(
    (p: PublicProduct) => {
      if (filter === "popular" && !popular.has(p.id)) return false;
      if (filter.startsWith("tag:") && !p.tags.includes(filter.slice(4))) return false;
      return !q || normalize(`${p.name} ${p.description ?? ""} ${p.ingredients ?? ""}`).includes(q);
    },
    [q, filter, popular],
  );
  const sections = useMemo(
    () =>
      menu.categories
        .map((c) => ({ ...c, items: c.productIds.map((id) => menu.products[id]!).filter(matches) }))
        .filter((c) => c.items.length > 0),
    [menu, matches],
  );
  const browsing = !q && filter === "all";
  const featured = useMemo(
    () => (browsing ? Object.values(menu.products).filter((p) => p.isFeatured) : []),
    [menu, browsing],
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
      { rootMargin: "-160px 0px -60% 0px" },
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
        navigator.vibrate?.(20);
        setToast(t("guest.added"));
      } else setOpenId(p.id);
    });
  };

  /** Dishes to suggest with this one: best sellers and house picks from other categories first. */
  const suggestionsFor = (p: PublicProduct) => {
    const all = Object.values(menu.products).filter((x) => x.id !== p.id && x.isAvailable && x.images[0]);
    const score = (x: PublicProduct) =>
      (x.categoryId !== p.categoryId ? 4 : 0) + (popular.has(x.id) ? 2 : 0) + (x.isFeatured ? 1 : 0);
    return all
      .filter((x) => score(x) > 0)
      .sort((a, b) => score(b) - score(a))
      .slice(0, 8);
  };

  const open = openId ? menu.products[openId] : null;
  const card = { money, popular, cart, adding, quickAdd, open: setOpenId, categoryIcon, t };

  return (
    <>
      {header}
      <div className="mx-auto max-w-3xl">
        <div className="sticky top-0 z-20 mt-3 bg-bg/95 pt-3 backdrop-blur-xl">
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
                className="h-11 w-full rounded-2xl border border-border bg-surface ps-11 pe-11 text-[16px] shadow-[var(--shadow-soft)] placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none atelier:rounded-full atelier:border-transparent atelier:bg-surface-2 nuit:rounded-full [&::-webkit-search-cancel-button]:hidden"
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
            <nav aria-label={t("guest.categoriesNav")} className="mt-2.5 border-b border-border">
              <div
                ref={tabsRef}
                className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2.5 atelier:gap-6 atelier:px-6 atelier:pb-0"
              >
                {sections.map((c) => (
                  <a
                    key={c.id}
                    href={`#c-${c.id}`}
                    data-chip={c.id}
                    aria-current={active === c.id ? "true" : undefined}
                    onClick={() => setActive(c.id)}
                    className={cn(
                      "flex h-10 shrink-0 items-center gap-2 rounded-full ps-1.5 pe-4 text-sm font-semibold whitespace-nowrap transition-colors nuit:px-4",
                      "atelier:h-11 atelier:rounded-none atelier:border-b-2 atelier:px-0 atelier:font-medium atelier:shadow-none atelier:ring-0",
                      active === c.id
                        ? "bg-fg text-bg shadow-sm atelier:border-fg atelier:bg-transparent atelier:text-fg nuit:bg-accent nuit:text-accent-fg"
                        : "bg-surface text-fg-muted ring-1 ring-border hover:text-fg atelier:border-transparent atelier:bg-transparent",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-7 place-items-center rounded-full atelier:hidden nuit:hidden",
                        active === c.id ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent-text",
                      )}
                    >
                      <CategoryIcon icon={c.icon} className="size-4" />
                    </span>
                    {c.name}
                  </a>
                ))}
              </div>
            </nav>
          ) : (
            <div className="h-2.5 border-b border-border" />
          )}
        </div>

        {/* Filters and layout switch */}
        <div className="flex items-center gap-2 pt-3">
          <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto ps-4">
            {(
              ["all", ...(popular.size ? ["popular"] : []), ...tagFilters.map((x) => `tag:${x}`)] as Filter[]
            ).map((f) => {
              const on = filter === f;
              const tag = f.startsWith("tag:") ? f.slice(4) : null;
              const meta = tag ? TAG_META[tag] : null;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(on ? "all" : f)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
                    on ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-muted hover:text-fg",
                  )}
                >
                  {f === "popular" ? <TrendingUp className="size-3.5" aria-hidden="true" /> : null}
                  {meta ? <meta.Icon className="size-3.5" aria-hidden="true" /> : null}
                  {f === "all"
                    ? t("guest.filterAll")
                    : f === "popular"
                      ? t("guest.popular")
                      : tagLabel(t, t.has, tag!)}
                </button>
              );
            })}
          </div>
          <div
            role="group"
            aria-label={t("guest.viewMode")}
            className="me-4 flex shrink-0 rounded-full bg-surface-2 p-0.5"
          >
            {(["list", "grid"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-label={t(`guest.view.${v}`)}
                onClick={() => writeView(v)}
                className={cn(
                  "grid size-7 place-items-center rounded-full transition-colors",
                  view === v ? "bg-surface text-fg shadow-sm" : "text-fg-subtle",
                )}
              >
                {v === "list" ? (
                  <LayoutList className="size-4" aria-hidden="true" />
                ) : (
                  <LayoutGrid className="size-4" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        </div>

        <main className="pb-36">
          {featured.length > 0 ? (
            <section className="pt-5" aria-labelledby="featured-title">
              <div className="flex items-center gap-2 px-4">
                <Sparkles className="size-5 text-accent atelier:hidden" aria-hidden="true" />
                <h2
                  id="featured-title"
                  className="font-menu-display text-lg font-bold tracking-tight atelier:text-[26px] atelier:font-medium nuit:font-medium nuit:text-accent-text"
                >
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
                      className="block h-full w-full cursor-pointer overflow-hidden rounded-3xl border border-border bg-surface text-start shadow-[var(--shadow-soft)] transition-transform active:scale-[0.985] atelier:rounded-none atelier:border-0 atelier:bg-transparent nuit:border-0 nuit:bg-transparent"
                    >
                      <div className="relative">
                        {p.images[0] ? (
                          <ProductImage
                            product={p}
                            size="md"
                            className={cn(
                              "aspect-[4/3] w-full atelier:rounded-lg nuit:rounded-3xl",
                              !p.isAvailable && "grayscale",
                            )}
                            eager
                          />
                        ) : (
                          <DishPlaceholder
                            icon={categoryIcon.get(p.id) ?? ""}
                            className="aspect-[4/3] w-full"
                          />
                        )}
                        <div className="absolute start-3 top-3 flex gap-1.5">
                          {popular.has(p.id) ? <PopularBadge /> : null}
                        </div>
                        <InCartBadge n={cart.byProduct[p.id] ?? 0} className="absolute end-3 top-3" />
                      </div>
                      <div className="flex items-end justify-between gap-2 p-3.5 atelier:px-0.5 nuit:px-0.5">
                        <div className="min-w-0">
                          <p className="truncate font-menu-display font-bold atelier:text-xl atelier:font-medium nuit:[font-family:var(--app-font)]">
                            {p.name}
                          </p>
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
              <p className="mt-4 font-semibold">
                {q ? t("guest.noResults", { q: query.trim() }) : t("guest.noFilterResults")}
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="mt-4 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold"
              >
                {t("guest.showAll")}
              </button>
            </div>
          ) : (
            sections.map((c, ci) => (
              <section
                key={c.id}
                id={`c-${c.id}`}
                data-category={c.id}
                className="scroll-mt-36 pt-7"
                aria-labelledby={`h-${c.id}`}
              >
                <div className="flex items-center gap-3 px-4 atelier:px-6">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text atelier:hidden nuit:hidden">
                    <CategoryIcon icon={c.icon} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2
                      id={`h-${c.id}`}
                      className="font-menu-display text-lg leading-tight font-bold tracking-tight atelier:text-[30px] atelier:font-medium nuit:text-2xl nuit:font-medium nuit:text-accent-text"
                    >
                      {c.name}
                    </h2>
                    <p className="text-xs text-fg-subtle">{t("guest.items", { count: c.items.length })}</p>
                  </div>
                </div>
                {c.description ? (
                  <p className="mt-2 px-4 text-sm leading-6 text-fg-muted">{c.description}</p>
                ) : null}
                {view === "grid" ? (
                  <ul className="mt-3 grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 atelier:gap-x-4 atelier:gap-y-6 atelier:px-6">
                    {c.items.map((p, pi) => (
                      <li key={p.id}>
                        <GridCard p={p} eager={ci === 0 && pi < 4} {...card} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="mt-3 grid gap-3 px-4 sm:grid-cols-2 atelier:mt-1 atelier:gap-0 atelier:px-6 atelier:sm:gap-x-8 nuit:gap-1">
                    {c.items.map((p, pi) => (
                      <li key={p.id}>
                        <ListCard p={p} eager={ci === 0 && pi < 4} {...card} />
                      </li>
                    ))}
                  </ul>
                )}
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
            className="animate-pop-in flex h-14 items-center gap-3 rounded-full bg-accent ps-2 pe-5 font-semibold text-accent-fg shadow-[var(--shadow-float)] transition-transform active:scale-[0.98] atelier:rounded-2xl"
          >
            <span className="relative grid size-10 place-items-center rounded-full bg-black/10">
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
          key={open.id}
          product={open}
          currency={currency}
          popular={popular.has(open.id)}
          inCart={cart.byProduct[open.id] ?? 0}
          suggestions={suggestionsFor(open)}
          onPick={setOpenId}
          onClose={() => setOpenId(null)}
          onAdded={(summary) => {
            setCart(summary);
            setOpenId(null);
            navigator.vibrate?.(20);
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

type CardProps = {
  p: PublicProduct;
  eager: boolean;
  money: (c: number) => string;
  popular: Set<string>;
  cart: CartSummary;
  adding: string | null;
  quickAdd: (p: PublicProduct) => void;
  open: (id: string) => void;
  categoryIcon: Map<string, string>;
  t: ReturnType<typeof useTranslations>;
};

/** Row card: text on the reading side, photo (or category tile) on the other with the "+" on it. */
function ListCard({ p, eager, money, popular, cart, adding, quickAdd, open, categoryIcon, t }: CardProps) {
  const tags = p.tags.filter((x) => TAG_META[x]).slice(0, 3);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(p.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open(p.id)}
      className={cn(
        "flex h-full w-full cursor-pointer gap-3 rounded-2xl border border-border bg-surface p-3 text-start shadow-[var(--shadow-soft)] transition-[transform,border-color] hover:border-border-strong active:scale-[0.99]",
        "atelier:items-center atelier:gap-4 atelier:rounded-none atelier:border-0 atelier:border-b atelier:bg-transparent atelier:px-0 atelier:py-5 atelier:hover:border-border",
        "nuit:items-center nuit:border-0 nuit:bg-transparent nuit:px-0 nuit:py-2.5",
        !p.isAvailable && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        {popular.has(p.id) ? <PopularBadge className="mb-1.5 self-start" /> : null}
        <p className="line-clamp-2 font-menu-display leading-snug font-bold atelier:text-[22px] atelier:leading-tight atelier:font-medium nuit:[font-family:var(--app-font)] nuit:font-semibold">
          {p.name}
        </p>
        {p.description ? (
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-fg-muted">{p.description}</p>
        ) : null}
        {tags.length || p.caloriesKcal ? (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {tags.map((tag) => (
              <TagChip key={tag} tag={tag} compact />
            ))}
            {p.caloriesKcal ? (
              <span className="text-[11px] text-fg-subtle tabular-nums">
                {t("guest.kcal", { n: p.caloriesKcal })}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-auto pt-2.5">
          <Price product={p} money={money} />
        </div>
      </div>
      <div className="relative shrink-0">
        {p.images[0] ? (
          <ProductImage
            product={p}
            size="sm"
            className={cn(
              "size-28 rounded-xl atelier:size-[76px] atelier:rounded-full nuit:size-24 nuit:rounded-2xl",
              !p.isAvailable && "grayscale",
            )}
            eager={eager}
          />
        ) : (
          <DishPlaceholder
            icon={categoryIcon.get(p.id) ?? ""}
            className="size-28 rounded-xl atelier:size-[76px] atelier:rounded-full nuit:size-24 nuit:rounded-2xl"
          />
        )}
        <InCartBadge n={cart.byProduct[p.id] ?? 0} className="absolute -start-1.5 -top-1.5" />
        {p.isAvailable ? (
          <AddButton
            label={t("guest.quickAdd", { name: p.name })}
            busy={adding === p.id}
            onClick={() => quickAdd(p)}
            className="absolute -end-1.5 -bottom-1.5"
          />
        ) : null}
      </div>
    </div>
  );
}

/** Photo-first card for the grid view. */
function GridCard({ p, eager, money, popular, cart, adding, quickAdd, open, categoryIcon, t }: CardProps) {
  const tags = p.tags.filter((x) => TAG_META[x]).slice(0, 2);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(p.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open(p.id)}
      className={cn(
        "flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-surface text-start shadow-[var(--shadow-soft)] transition-transform active:scale-[0.985]",
        "atelier:overflow-visible atelier:rounded-none atelier:border-0 atelier:bg-transparent nuit:overflow-visible nuit:border-0 nuit:bg-transparent",
        !p.isAvailable && "opacity-60",
      )}
    >
      <div className="relative">
        {p.images[0] ? (
          <ProductImage
            product={p}
            size="md"
            className={cn(
              "aspect-square w-full atelier:rounded-lg nuit:rounded-2xl",
              !p.isAvailable && "grayscale",
            )}
            eager={eager}
          />
        ) : (
          <DishPlaceholder
            icon={categoryIcon.get(p.id) ?? ""}
            className="aspect-square w-full atelier:rounded-lg nuit:rounded-2xl"
          />
        )}
        <div className="absolute start-2 top-2 flex flex-col items-start gap-1">
          {popular.has(p.id) ? <PopularBadge /> : null}
          {tags.map((tag) => (
            <TagChip key={tag} tag={tag} compact className="bg-surface/95 shadow-sm" />
          ))}
        </div>
        <InCartBadge n={cart.byProduct[p.id] ?? 0} className="absolute end-2 top-2" />
        {p.isAvailable ? (
          <AddButton
            label={t("guest.quickAdd", { name: p.name })}
            busy={adding === p.id}
            onClick={() => quickAdd(p)}
            className="absolute end-2 -bottom-4"
          />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-3 pt-2.5 atelier:px-0.5 nuit:px-0.5">
        <p className="line-clamp-2 pe-8 font-menu-display text-[15px] leading-snug font-bold atelier:text-lg atelier:leading-tight atelier:font-medium nuit:[font-family:var(--app-font)]">
          {p.name}
        </p>
        <div className="mt-auto pt-2">
          <Price product={p} money={money} className="text-sm" />
        </div>
      </div>
    </div>
  );
}

export { ProductImage };
