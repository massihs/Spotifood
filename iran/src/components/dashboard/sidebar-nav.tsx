"use client";

import { LayoutGrid, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
  /** Shown in the mobile bottom tab bar (keep it to 4 items). */
  primary?: boolean;
};

function useActive() {
  const pathname = usePathname();
  return (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Desktop sidebar navigation (on the always-dark sidebar). */
export function SidebarNav({ items, label }: { items: NavItem[]; label: string }) {
  const isActive = useActive();
  return (
    <nav aria-label={label} className="space-y-1">
      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium transition-colors",
              active ? "bg-white/12 text-white" : "text-white/60 hover:bg-white/6 hover:text-white",
            )}
          >
            <span
              className={cn("size-5 shrink-0 [&_svg]:size-5", active ? "text-accent" : "")}
              aria-hidden="true"
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile: bottom tab bar (primary items) + a "More" sheet with everything else. */
export function MobileTabBar({ items, sheet }: { items: NavItem[]; sheet: ReactNode }) {
  const t = useTranslations("nav");
  const isActive = useActive();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  const primary = items.filter((i) => i.primary).slice(0, 4);
  const moreActive = !primary.some(isActive);

  return (
    <>
      <nav
        aria-label={t("mainNav")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden print:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {primary.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                  active ? "text-fg" : "text-fg-subtle",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-12 place-items-center rounded-full transition-colors [&_svg]:size-5",
                    active && "bg-ink text-accent",
                  )}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <span className="max-w-full truncate px-1">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold",
              open || moreActive ? "text-fg" : "text-fg-subtle",
            )}
          >
            <span
              className={cn(
                "grid h-7 w-12 place-items-center rounded-full [&_svg]:size-5",
                (open || moreActive) && "bg-ink text-accent",
              )}
              aria-hidden="true"
            >
              <LayoutGrid />
            </span>
            {t("more")}
          </button>
        </div>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("more")}>
          <button
            type="button"
            aria-label={t("close")}
            className="animate-fade-in absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="animate-sheet-up absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[1.75rem] bg-[#0b0b0b] px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/25" aria-hidden="true" />
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="grid size-9 place-items-center rounded-full bg-white/10"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {items.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center text-xs font-semibold",
                      active ? "bg-white/15 text-white" : "bg-white/6 text-white/75",
                    )}
                  >
                    <span className={cn("[&_svg]:size-6", active && "text-accent")} aria-hidden="true">
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="mt-4">{sheet}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
