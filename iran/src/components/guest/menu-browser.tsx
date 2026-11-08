"use client";

import {
  LayoutGrid,
  LayoutList,
  Minus,
  Plus,
  Rows3,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/cn";
import type { MenuTheme } from "@/lib/menu-themes";
import type { PublicMenu, PublicProduct } from "@/server/modules/menu/public";
import {
  AddButton,
  DishPlaceholder,
  InCartBadge,
  PopularBadge,
  Price,
  ProductImage,
  splitDescription,
  TAG_META,
  TagChip,
  tagLabel,
} from "./parts";

/** Search folding: case, Latin accents, Arabic/Persian letter variants and diacritics. */
const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟ]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/‌/g, " ")
    .toLowerCase();

/** List or photo grid, remembered on this device. */
const VIEW_KEY = "sf-menu-view";
const VIEW_EVENT = "sf-menu-view-change";
type View = "list" | "grid";
const readStoredView = (): View | null => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "grid" || v === "list" ? v : null;
  } catch {
    return null;
  }
};
const subscribeView = (cb: () => void) => {
  window.addEventListener(VIEW_EVENT, cb);
  return () => window.removeEventListener(VIEW_EVENT, cb);
};
const writeView = (v: View) => {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(VIEW_EVENT));
};

type Filter = "all" | "popular" | `tag:${string}`;
type T = ReturnType<typeof useTranslations>;

export type MenuBrowserProps = {
  menu: PublicMenu;
  /** Prices of the lists (thousand tomans when the restaurant chose short prices). */
  money: (cents: number) => string;
  /** Short prices: each section shows the unit instead of its number of dishes. */
  shortPrices?: boolean;
  popular: Set<string>;
  /** Units of each dish already in the cart. */
  counts: Record<string, number>;
  /** A dish whose cart change is on its way (its buttons wait). */
  busyId?: string | null;
  theme: MenuTheme;
  /** A fixed bar sits above the sticky search (the table menu's compact header). */
  belowFixedBar?: boolean;
  /** List or grid when this device never chose. */
  defaultView?: View;
  onOpen: (id: string) => void;
  onAdd: (p: PublicProduct) => void;
  /** "−" on a card once the dish is in the cart. */
  onRemove: (p: PublicProduct) => void;
};

/**
 * Browsing a menu: search, filters, category bar (with the full list one tap away), house picks
 * and the dishes, as a list or a photo grid. Shared by the table menu, online ordering and the
 * counter kiosk, so guests find the same gestures everywhere.
 */
export function MenuBrowser({
  menu,
  money,
  shortPrices = false,
  popular,
  counts,
  busyId = null,
  theme,
  belowFixedBar = false,
  defaultView = "list",
  onOpen,
  onAdd,
  onRemove,
}: MenuBrowserProps) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [active, setActive] = useState<string | null>(menu.categories[0]?.id ?? null);
  const [stuck, setStuck] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const view = useSyncExternalStore(
    subscribeView,
    () => readStoredView() ?? defaultView,
    () => defaultView,
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
        .map((c) => ({
          ...c,
          items: c.productIds
            .map((id) => menu.products[id])
            .filter((p): p is PublicProduct => !!p && matches(p)),
        }))
        .filter((c) => c.items.length > 0),
    [menu, matches],
  );
  const browsing = !q && filter === "all";
  const featured = useMemo(
    () => (browsing ? Object.values(menu.products).filter((p) => p.isFeatured) : []),
    [menu, browsing],
  );

  // Once the bar sticks to the top, the search folds into an icon: more room for the dishes.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const offset = belowFixedBar ? 48 : 0;
    const io = new IntersectionObserver(
      ([e]) => setStuck(!!e && !e.isIntersecting && e.boundingClientRect.top < offset + 1),
      { rootMargin: `-${offset}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [belowFixedBar]);
  const showSearch = !stuck || searchOpen || query !== "";

  // Scroll-spy: highlight the category currently on screen.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.getAttribute("data-category"));
      },
      { rootMargin: "-200px 0px -55% 0px" },
    );
    document.querySelectorAll("[data-category]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    const tab = tabsRef.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    tab?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

  const jumpTo = (id: string) => {
    setCategoriesOpen(false);
    setActive(id);
    document.getElementById(`c-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filterChips = [
    "all",
    ...(popular.size ? ["popular"] : []),
    ...tagFilters.map((x) => `tag:${x}`),
  ] as Filter[];
  const filterLabel = (f: Filter) =>
    f === "all"
      ? t("guest.filterAll")
      : f === "popular"
        ? t("guest.popular")
        : tagLabel(t, t.has, f.slice(4));
  const card = { money, popular, counts, busyId, onAdd, onRemove, onOpen, categoryIcon, t, theme };
  const iconButton =
    "relative grid size-10 shrink-0 place-items-center rounded-full bg-surface text-fg ring-1 ring-border transition-colors active:bg-surface-2 atelier:bg-transparent";

  return (
    <>
      {/* Marks the top of the sticky bar: past it, the bar is stuck. */}
      <div ref={sentinel} aria-hidden="true" />
      <div
        className={cn(
          "sticky z-20 mt-2 bg-bg/95 pt-2 backdrop-blur-xl transition-[top] duration-200",
          belowFixedBar ? "top-12" : "top-0",
        )}
      >
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
            showSearch ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
          aria-hidden={!showSearch}
        >
          <div className="overflow-hidden">
            <div className="flex gap-2 px-4 pb-0.5">
              <label className="relative block min-w-0 flex-1">
                <span className="sr-only">{t("guest.search")}</span>
                <Search
                  className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle"
                  aria-hidden="true"
                />
                <input
                  ref={searchRef}
                  type="search"
                  tabIndex={showSearch ? undefined : -1}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={() => {
                    if (!query.trim()) setSearchOpen(false);
                  }}
                  placeholder={t("guest.search")}
                  enterKeyHint="search"
                  className="h-11 w-full rounded-2xl border border-border bg-surface ps-11 pe-11 text-[16px] shadow-[var(--shadow-soft)] placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none atelier:rounded-full atelier:border-transparent atelier:bg-surface-2 nuit:rounded-full [&::-webkit-search-cancel-button]:hidden"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                    aria-label={t("common.clear")}
                    className="absolute end-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-surface-2 text-fg"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </label>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                tabIndex={showSearch ? undefined : -1}
                aria-label={t("guest.filters")}
                title={t("guest.filters")}
                className={cn(
                  "relative grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-surface text-fg atelier:rounded-full atelier:border-transparent atelier:bg-surface-2 nuit:rounded-full",
                  filter !== "all" && "border-accent text-accent-text",
                )}
              >
                <SlidersHorizontal className="size-[18px]" aria-hidden="true" />
                {filter !== "all" ? (
                  <span className="absolute end-2 top-2 size-2 rounded-full bg-accent" aria-hidden="true" />
                ) : null}
              </button>
            </div>
          </div>
        </div>
        {!q ? (
          <nav aria-label={t("guest.categoriesNav")} className="mt-2 border-b border-border">
            <div className="flex items-center gap-2 ps-4 pb-2">
              {!showSearch ? (
                <button
                  type="button"
                  aria-label={t("guest.search")}
                  onClick={() => {
                    setSearchOpen(true);
                    // Within the tap itself: phones only open the keyboard for a focus made then.
                    searchRef.current?.focus({ preventScroll: true });
                  }}
                  className={cn(iconButton, "animate-pop-in")}
                >
                  <Search className="size-[18px]" aria-hidden="true" />
                </button>
              ) : null}
              {sections.length > 1 ? (
                <button
                  type="button"
                  aria-label={t("guest.allCategories")}
                  title={t("guest.allCategories")}
                  aria-haspopup="dialog"
                  onClick={() => setCategoriesOpen(true)}
                  className={iconButton}
                >
                  <Rows3 className="size-[18px]" aria-hidden="true" />
                  {filter !== "all" && !showSearch ? (
                    <span
                      className="absolute end-1.5 top-1.5 size-2 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              ) : null}
              <div
                ref={tabsRef}
                className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto pe-4 atelier:gap-6 atelier:ps-1"
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
                      "atelier:h-10 atelier:rounded-none atelier:border-b-2 atelier:px-0 atelier:text-[15px] atelier:font-medium atelier:shadow-none atelier:ring-0",
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
            </div>
          </nav>
        ) : (
          <div className="h-2 border-b border-border" />
        )}
      </div>

      {filter !== "all" ? (
        <div className="flex items-center gap-2 px-4 pt-3 text-sm">
          <span className="text-fg-muted">{t("guest.filtered")}</span>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 font-semibold text-accent-fg"
          >
            {filterLabel(filter)}
            <X className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t("common.clear")}</span>
          </button>
        </div>
      ) : null}

      <div className="pb-36">
        {featured.length > 0 ? (
          <section className="pt-4" aria-labelledby="featured-title">
            <div className="flex items-center gap-2 px-4 atelier:px-5">
              <Sparkles className="size-[18px] text-accent atelier:hidden" aria-hidden="true" />
              <h2
                id="featured-title"
                className="font-menu-display text-base font-bold tracking-tight atelier:text-[22px] atelier:font-medium nuit:text-lg nuit:font-medium nuit:text-accent-text"
              >
                {t("guest.featured")}
              </h2>
            </div>
            <ul className="no-scrollbar mt-2.5 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 atelier:px-5">
              {featured.map((p) => (
                <li key={p.id} className="w-[44%] max-w-52 shrink-0 snap-start">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(p.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(p.id)}
                    className="block h-full w-full cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface text-start shadow-[var(--shadow-soft)] transition-transform active:scale-[0.985] atelier:overflow-visible atelier:rounded-none atelier:border-0 atelier:bg-transparent nuit:overflow-visible nuit:border-0 nuit:bg-transparent"
                  >
                    <div className="relative">
                      {p.images[0] ? (
                        <ProductImage
                          product={p}
                          size="md"
                          className={cn(
                            "aspect-[4/3] w-full atelier:rounded-xl nuit:rounded-2xl",
                            !p.isAvailable && "grayscale",
                          )}
                          eager
                        />
                      ) : (
                        <DishPlaceholder
                          icon={categoryIcon.get(p.id) ?? ""}
                          className="aspect-[4/3] w-full atelier:rounded-xl nuit:rounded-2xl"
                        />
                      )}
                      {popular.has(p.id) ? <PopularBadge className="absolute start-2 top-2" /> : null}
                      <InCartBadge n={counts[p.id] ?? 0} className="absolute end-2 top-2" />
                    </div>
                    <div className="p-2.5 atelier:px-0.5 nuit:px-0.5">
                      <p className="truncate font-menu-display text-[15px] font-bold atelier:text-lg atelier:font-medium nuit:[font-family:var(--app-font)]">
                        {p.name}
                      </p>
                      <Price product={p} money={money} className="mt-0.5 text-sm" />
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
              className="mt-4 h-11 rounded-full bg-surface-2 px-5 text-sm font-semibold"
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
              className="scroll-mt-44 pt-6"
              aria-labelledby={`h-${c.id}`}
            >
              <div className="flex items-end gap-3 px-4 atelier:px-5">
                <span className="grid size-9 shrink-0 place-items-center self-center rounded-xl bg-accent-soft text-accent-text atelier:hidden nuit:hidden">
                  <CategoryIcon icon={c.icon} className="size-[18px]" />
                </span>
                <h2
                  id={`h-${c.id}`}
                  className="min-w-0 flex-1 font-menu-display text-lg leading-tight font-bold tracking-tight atelier:text-[28px] atelier:font-medium nuit:text-xl nuit:font-medium nuit:text-accent-text"
                >
                  {c.name}
                </h2>
                <span className="shrink-0 pb-0.5 text-xs text-fg-subtle">
                  {shortPrices ? t("guest.priceUnit") : t("guest.items", { count: c.items.length })}
                </span>
              </div>
              {c.description ? (
                <p className="mt-1.5 px-4 text-sm leading-6 text-fg-muted atelier:px-5">{c.description}</p>
              ) : null}
              {view === "grid" ? (
                <ul className="mt-3 grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 atelier:gap-x-4 atelier:gap-y-6 atelier:px-5">
                  {c.items.map((p, pi) => (
                    <li key={p.id}>
                      <GridCard p={p} eager={ci === 0 && pi < 4} {...card} />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="mt-3 grid gap-3 px-4 sm:grid-cols-2 lg:grid-cols-3 atelier:mt-1 atelier:gap-0 atelier:px-5 atelier:sm:gap-x-8 nuit:gap-1">
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
      </div>

      {categoriesOpen ? (
        <Sheet title={t("guest.allCategories")} onClose={() => setCategoriesOpen(false)} t={t}>
          <ul className="grid grid-cols-2 gap-2">
            {sections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(c.id)}
                  aria-current={active === c.id ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl p-2.5 text-start transition-colors",
                    active === c.id
                      ? "bg-accent-soft ring-1 ring-accent/40"
                      : "bg-surface-2 active:bg-surface-3",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl",
                      active === c.id ? "bg-accent text-accent-fg" : "bg-surface text-accent-text",
                    )}
                  >
                    <CategoryIcon icon={c.icon} className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{c.name}</span>
                    <span className="block text-xs text-fg-muted">
                      {t("guest.items", { count: c.items.length })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}

      {filtersOpen ? (
        <Sheet title={t("guest.filters")} onClose={() => setFiltersOpen(false)} t={t}>
          <p className="mb-2 text-sm font-semibold text-fg-muted">{t("guest.show")}</p>
          <div className="flex flex-wrap gap-2">
            {filterChips.map((f) => {
              const on = filter === f;
              const meta = f.startsWith("tag:") ? TAG_META[f.slice(4)] : null;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setFilter(f);
                    setFiltersOpen(false);
                  }}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors",
                    on ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg",
                  )}
                >
                  {f === "popular" ? <TrendingUp className="size-4" aria-hidden="true" /> : null}
                  {meta ? <meta.Icon className="size-4" aria-hidden="true" /> : null}
                  {filterLabel(f)}
                </button>
              );
            })}
          </div>
          <p className="mt-5 mb-2 text-sm font-semibold text-fg-muted">{t("guest.viewMode")}</p>
          <div className="grid grid-cols-2 gap-2">
            {(["list", "grid"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => {
                  writeView(v);
                  setFiltersOpen(false);
                }}
                className={cn(
                  "flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold",
                  view === v ? "bg-fg text-bg" : "bg-surface-2 text-fg",
                )}
              >
                {v === "list" ? (
                  <LayoutList className="size-[18px]" aria-hidden="true" />
                ) : (
                  <LayoutGrid className="size-[18px]" aria-hidden="true" />
                )}
                {t(`guest.view.${v}`)}
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

/** A bottom sheet over the menu (tap outside or the cross to close). */
function Sheet({
  title,
  onClose,
  t,
  children,
}: {
  title: string;
  onClose: () => void;
  t: T;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label={t("guest.close")}
        className="animate-fade-in absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div className="animate-sheet-up relative mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-lg font-bold">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("guest.close")}
            className="grid size-10 place-items-center rounded-full bg-surface-2"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type CardProps = {
  p: PublicProduct;
  eager: boolean;
  money: (c: number) => string;
  popular: Set<string>;
  counts: Record<string, number>;
  busyId: string | null;
  onAdd: (p: PublicProduct) => void;
  onRemove: (p: PublicProduct) => void;
  onOpen: (id: string) => void;
  categoryIcon: Map<string, string>;
  t: T;
  theme: MenuTheme;
};

/** − n + once the dish is in the cart: change the quantity without leaving the menu. */
function CardStepper({
  p,
  n,
  busy,
  onAdd,
  onRemove,
  t,
  className,
}: {
  p: PublicProduct;
  n: number;
  busy: boolean;
  onAdd: (p: PublicProduct) => void;
  onRemove: (p: PublicProduct) => void;
  t: T;
  className?: string;
}) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div
      role="group"
      aria-label={t("guest.inCart", { n })}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "animate-pop-in flex h-10 items-center justify-between gap-1 rounded-full bg-surface p-0.5 shadow-[var(--shadow-float)] ring-1 ring-border",
        busy && "opacity-80",
        className,
      )}
    >
      <button
        type="button"
        aria-label={t("guest.removeOne", { name: p.name })}
        onClick={stop(() => onRemove(p))}
        className="grid size-9 shrink-0 place-items-center rounded-full text-fg transition-transform active:scale-90 active:bg-surface-2"
      >
        {n === 1 ? (
          <Trash2 className="size-4" aria-hidden="true" />
        ) : (
          <Minus className="size-4" strokeWidth={2.5} aria-hidden="true" />
        )}
      </button>
      <span className="min-w-5 text-center text-sm font-bold tabular-nums" aria-hidden="true">
        {n}
      </span>
      <button
        type="button"
        aria-label={t("guest.quickAdd", { name: p.name })}
        onClick={stop(() => onAdd(p))}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-fg transition-transform active:scale-90"
      >
        <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Row card: the text on the reading side (name, Latin name, description, then price), the photo
 * on the other with "+" — or "− n +" once the dish is in the cart — in the thumb's reach.
 * Atelier shows no tile for dishes without a photo: the buttons then sit on the price line.
 */
function ListCard({
  p,
  eager,
  money,
  popular,
  counts,
  busyId,
  onAdd,
  onRemove,
  onOpen,
  categoryIcon,
  t,
  theme,
}: CardProps) {
  const tags = p.tags.filter((x) => TAG_META[x]).slice(0, 3);
  const { latin, text } = splitDescription(p.description, p.name);
  const photo = p.images[0] || theme !== "atelier";
  const n = counts[p.id] ?? 0;
  const busy = busyId === p.id;
  const add = (className?: string) =>
    n > 0 ? (
      <CardStepper p={p} n={n} busy={busy} onAdd={onAdd} onRemove={onRemove} t={t} className={className} />
    ) : (
      <AddButton
        label={t("guest.quickAdd", { name: p.name })}
        busy={busy}
        onClick={() => onAdd(p)}
        className={className}
      />
    );
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(p.id)}
      onKeyDown={(e) => e.target === e.currentTarget && (e.key === "Enter" || e.key === " ") && onOpen(p.id)}
      className={cn(
        "flex h-full w-full cursor-pointer gap-3.5 rounded-2xl border border-border bg-surface p-3 text-start shadow-[var(--shadow-soft)] transition-[transform,border-color] hover:border-border-strong active:scale-[0.99]",
        "atelier:gap-4 atelier:rounded-none atelier:border-0 atelier:border-b atelier:bg-transparent atelier:px-0 atelier:py-5 atelier:hover:border-border",
        "nuit:border-0 nuit:bg-transparent nuit:px-0 nuit:py-3",
        !p.isAvailable && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {popular.has(p.id) ? <PopularBadge className="mb-1.5 self-start" /> : null}
        <p className="line-clamp-2 font-menu-display text-[17px] leading-snug font-bold atelier:text-[22px] atelier:leading-tight atelier:font-medium nuit:[font-family:var(--app-font)] nuit:font-semibold">
          {p.name}
        </p>
        {latin ? (
          <p
            className="mt-0.5 truncate text-xs tracking-wide text-fg-subtle"
            dir="ltr"
            style={{ textAlign: "end" }}
          >
            {latin}
          </p>
        ) : null}
        {text ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-fg-muted">{text}</p> : null}
        {tags.length ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {tags.map((tag) => (
              <TagChip key={tag} tag={tag} compact />
            ))}
          </div>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
          <Price product={p} money={money} />
          {p.isAvailable && !photo ? add() : null}
        </div>
      </div>
      {photo ? (
        <div className="relative shrink-0 self-start pb-1">
          {p.images[0] ? (
            <ProductImage
              product={p}
              size="sm"
              className={cn("size-[6.75rem] rounded-2xl atelier:rounded-xl", !p.isAvailable && "grayscale")}
              eager={eager}
            />
          ) : (
            <DishPlaceholder icon={categoryIcon.get(p.id) ?? ""} className="size-[6.75rem] rounded-2xl" />
          )}
          {p.isAvailable
            ? n > 0
              ? add("absolute inset-x-0 -bottom-1.5")
              : add(
                  "absolute -end-1.5 bottom-0.5 size-10 ring-[3px] ring-surface atelier:bg-surface nuit:ring-[var(--bg)]",
                )
            : null}
        </div>
      ) : null}
    </div>
  );
}

/** Photo-first card for the grid view. */
function GridCard({
  p,
  eager,
  money,
  popular,
  counts,
  busyId,
  onAdd,
  onRemove,
  onOpen,
  categoryIcon,
  t,
}: CardProps) {
  const tags = p.tags.filter((x) => TAG_META[x]).slice(0, 2);
  const n = counts[p.id] ?? 0;
  const busy = busyId === p.id;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(p.id)}
      onKeyDown={(e) => e.target === e.currentTarget && (e.key === "Enter" || e.key === " ") && onOpen(p.id)}
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
              "aspect-square w-full atelier:rounded-xl nuit:rounded-2xl",
              !p.isAvailable && "grayscale",
            )}
            eager={eager}
          />
        ) : (
          <DishPlaceholder
            icon={categoryIcon.get(p.id) ?? ""}
            className="aspect-square w-full atelier:rounded-xl nuit:rounded-2xl"
          />
        )}
        <div className="absolute start-2 top-2 flex flex-col items-start gap-1">
          {popular.has(p.id) ? <PopularBadge /> : null}
          {tags.map((tag) => (
            <TagChip key={tag} tag={tag} compact className="bg-surface/95 shadow-sm" />
          ))}
        </div>
        {p.isAvailable && n > 0 ? (
          <CardStepper
            p={p}
            n={n}
            busy={busy}
            onAdd={onAdd}
            onRemove={onRemove}
            t={t}
            className="absolute inset-x-2 bottom-2"
          />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-3 pt-2.5 atelier:px-0.5 nuit:px-0.5">
        <p className="line-clamp-2 font-menu-display text-[15px] leading-snug font-bold atelier:text-lg atelier:leading-tight atelier:font-medium nuit:[font-family:var(--app-font)]">
          {p.name}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Price product={p} money={money} className="text-sm" />
          {p.isAvailable && n === 0 ? (
            <AddButton label={t("guest.quickAdd", { name: p.name })} busy={busy} onClick={() => onAdd(p)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
