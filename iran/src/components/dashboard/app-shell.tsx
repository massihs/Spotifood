import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/[locale]/(auth)/actions";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo, LogoMark } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";
import { MobileTabBar, SidebarNav, type NavItem } from "./sidebar-nav";

/** Shared chrome for the restaurant dashboard and the super-admin console. */
export async function AppShell({
  title,
  subtitle,
  avatar,
  nav,
  footer,
  user,
  headerExtra,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Restaurant logo URL, shown in the sidebar identity card. */
  avatar?: string | null;
  nav: NavItem[];
  footer?: ReactNode;
  /** Shown in the top bar on every breakpoint (notifications, live status). */
  headerExtra?: ReactNode;
  user: { fullName: string; email: string };
  children: ReactNode;
}) {
  const t = await getTranslations();
  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white text-lg font-black text-[#0b0b0b]">
        {avatar ? (
          <img src={avatar} alt="" className="size-full object-contain p-0.5" />
        ) : (
          ([...title.trim()][0] ?? "S")
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate font-bold">{title}</p>
        {subtitle ? <p className="truncate text-xs opacity-60">{subtitle}</p> : null}
      </div>
    </div>
  );
  const account = (
    <div className="rounded-2xl bg-white/6 p-3">
      <p className="truncate text-sm font-semibold">{user.fullName}</p>
      <p className="truncate text-xs text-white/50">{user.email}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <LanguageSwitcher tone="inverted" />
        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-medium whitespace-nowrap text-white/80 hover:bg-white/15 hover:text-white"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {t("common.logout")}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-surface-2 lg:grid lg:grid-cols-[272px_1fr] print:block print:bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        {t("common.skipToContent")}
      </a>

      {/* Desktop sidebar: always dark */}
      <div className="hidden bg-[#0b0b0b] lg:block print:hidden">
        <aside className="flex flex-col text-white lg:sticky lg:top-0 lg:h-dvh">
          <div className="px-5 pt-6 pb-4">
            <Link
              href="/dashboard"
              aria-label="Spotifood"
              className="inline-flex text-white [&_.text-fg]:text-white"
            >
              <Logo className="text-white" />
            </Link>
          </div>
          <div className="mx-3 rounded-2xl bg-white/6 p-3">{identity}</div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <SidebarNav items={nav} label={title} />
            {footer ? <div className="mt-4 border-t border-white/10 pt-4">{footer}</div> : null}
          </div>
          <div className="p-3">{account}</div>
        </aside>
      </div>

      <div className="min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-md print:hidden">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-8">
            <Link href="/dashboard" aria-label="Spotifood" className="lg:hidden">
              <LogoMark className="size-9" />
            </Link>
            <div className="min-w-0 flex-1 lg:hidden">
              <p className="truncate font-bold">{title}</p>
              {subtitle ? <p className="truncate text-xs text-fg-muted">{subtitle}</p> : null}
            </div>
            <div className="ms-auto flex items-center gap-1">{headerExtra}</div>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto max-w-7xl px-4 pt-6 pb-28 sm:px-8 lg:pt-8 lg:pb-12 print:max-w-none print:p-0"
        >
          {children}
        </main>
      </div>

      <MobileTabBar
        items={nav}
        sheet={
          <div className="space-y-3 [&_a]:text-white/80">
            {footer ? <div className="rounded-2xl bg-white/6 p-2">{footer}</div> : null}
            {account}
          </div>
        }
      />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="min-h-dvh bg-surface-2 lg:grid lg:grid-cols-[272px_1fr]" aria-busy="true">
      <aside className="hidden bg-[#0b0b0b] lg:block" />
      <div className="px-4 py-8 sm:px-8">
        <div className="h-8 w-56 animate-pulse rounded-full bg-surface-3" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-3xl bg-surface" />
          ))}
        </div>
      </div>
    </div>
  );
}
