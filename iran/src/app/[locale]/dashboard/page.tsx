import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  ChefHat,
  LogOut,
  ReceiptText,
  Shield,
  Store,
  UtensilsCrossed,
  Wallet,
} from "@/components/icons";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/ui/logo";
import { EmptyState } from "@/components/ui/empty-state";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/app/[locale]/(auth)/actions";
import { cn } from "@/lib/cn";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { screenAllowed } from "@/lib/screens";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { logoUrl } from "@/server/modules/restaurants/settings";
import { workspaceOverview, type WorkspaceVenue } from "@/server/modules/dashboard/workspace";
import { planLabel } from "@/lib/plan-name";

/**
 * The workspace home: each venue as a card in its own colour, with today's takings and orders
 * (owners and managers), what is going on right now, the plan, and the screens one tap away.
 */
export default function DashboardIndex() {
  return (
    <div className="min-h-dvh bg-bg">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-accent/10 to-transparent"
      />
      <Suspense
        fallback={
          <div className="mx-auto max-w-6xl px-5 py-24">
            <div className="h-10 w-64 animate-pulse rounded-xl bg-surface-2" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-64 animate-pulse rounded-3xl bg-surface-2" />
              ))}
            </div>
          </div>
        }
      >
        <Workspace />
      </Suspense>
    </div>
  );
}

async function Workspace() {
  const user = await requireUser();
  const venues = await workspaceOverview(db, user);
  // A super admin always gets the choice (the platform admin first) instead of landing in
  // their one restaurant with the admin link far down the sidebar.
  if (venues.length === 1 && !user.isSuperAdmin) redirect(venues[0]!.href);
  if (venues.length === 0 && user.isSuperAdmin) redirect("/admin");

  const [t, tw, format, locale] = await Promise.all([
    getTranslations(),
    getTranslations("workspace"),
    getFormatter(),
    getLocale(),
  ]);
  const today = format.dateTime(new Date(), { weekday: "long", day: "numeric", month: "long" });
  const live = venues.reduce((s, v) => s + v.liveOrders, 0);
  const firstName = user.fullName.split(/\s+/)[0] ?? user.fullName;

  return (
    <div className="relative mx-auto max-w-6xl px-5 pb-20">
      <header className="flex items-center justify-between gap-3 py-5">
        <Link href="/" aria-label="Spotifood">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <form action={logoutAction}>
            <button
              type="submit"
              className="kashi-btn kashi-frame inline-flex h-10 items-center gap-2 px-3 text-sm font-semibold text-fg-muted [--kashi-fill-hover:var(--surface-2)] hover:text-fg"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="max-sm:sr-only">{tw("logout")}</span>
            </button>
          </form>
        </div>
      </header>

      <section className="mt-6 flex flex-wrap items-end justify-between gap-4 sm:mt-10">
        <div>
          <p className="text-sm font-semibold text-fg-muted">{today}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
            {tw("hello", { name: firstName })}
          </h1>
          <p className="mt-2 text-fg-muted">
            {venues.length ? tw("summary", { venues: venues.length, live }) : t("dashboard.noRestaurantBody")}
          </p>
        </div>
        <Link
          href="/pro"
          className="kashi-btn kashi-frame inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold [--kashi-fill-hover:var(--surface-2)] [--kashi-fill:var(--surface)]"
        >
          <Briefcase className="size-4" aria-hidden="true" />
          {tw("teamSpace")}
        </Link>
      </section>

      {user.isSuperAdmin ? (
        <Link
          href="/admin"
          className="group mt-8 flex items-center gap-4 overflow-hidden rounded-3xl bg-ink p-5 text-ink-fg shadow-[var(--shadow-float)] sm:p-6"
        >
          <span className="kashi-tile grid size-12 shrink-0 place-items-center bg-white/10">
            <Shield className="size-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold">{t("nav.admin")}</span>
            <span className="block text-sm opacity-70">{tw("adminHint")}</span>
          </span>
          <ArrowLeft className="size-5 opacity-60 transition-transform group-hover:-translate-x-1 ltr:rotate-180 ltr:group-hover:translate-x-1" />
        </Link>
      ) : null}

      {venues.length ? (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((v) => (
            <li key={v.id} data-brand={v.brandColor}>
              <VenueCard v={v} t={t} tw={tw} locale={locale} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-10"
          icon={<Store />}
          title={t("dashboard.noRestaurantTitle")}
          description={tw("noVenueHint")}
          action={
            <Link
              href="/pro"
              className="kashi-btn inline-flex h-10 items-center bg-accent px-5 text-sm font-bold text-accent-fg"
            >
              {tw("teamSpace")}
            </Link>
          }
        />
      )}
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations>>;
type TW = Awaited<ReturnType<typeof getTranslations<"workspace">>>;

function VenueCard({ v, t, tw, locale }: { v: WorkspaceVenue; t: T; tw: TW; locale: string }) {
  const logo = logoUrl(v.logoKey);
  const money = (c: number) => formatMoney(c, v.currency, locale);
  const big = (c: number) => formatMoneyCompact(c, v.currency, locale);
  const base = `/dashboard/${v.id}`;
  const shortcuts = [
    { screen: "orders", href: `${base}/orders`, icon: ReceiptText, label: t("nav.orders") },
    { screen: "kitchen", href: `${base}/kitchen`, icon: ChefHat, label: t("nav.kitchen") },
    { screen: "pos", href: `${base}/pos`, icon: Wallet, label: t("nav.pos") },
    { screen: "menu", href: `${base}/menu`, icon: UtensilsCrossed, label: t("nav.menu") },
    {
      screen: "reservations",
      href: `${base}/reservations`,
      icon: CalendarDays,
      label: t("nav.reservations"),
    },
  ]
    .filter((s) => screenAllowed(v.screens, s.screen as "orders"))
    .slice(0, 4);
  const plan = v.plan;
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-float)]">
      {/* The venue's colour, as a band behind its logo. */}
      <div
        className="relative h-20 overflow-hidden"
        style={{ background: "var(--brand-gradient)" }}
        aria-hidden="true"
      >
        <div className="absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,.35)_1px,transparent_1px)] [background-size:12px_12px] opacity-40" />
      </div>
      <span className="absolute end-4 top-4 flex flex-wrap justify-end gap-1.5">
        {v.status === "suspended" ? (
          <span className="kashi-btn bg-danger px-2.5 py-1 text-xs font-bold text-white [--cut:5px]">
            {t("admin.status.suspended")}
          </span>
        ) : null}
        <span className="kashi-btn bg-black/25 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur [--cut:5px]">
          {v.jobName ?? t(`roles.${v.role}`)}
        </span>
      </span>
      <div className="relative -mt-9 flex items-end justify-between gap-3 px-5">
        {logo ? (
          <img
            src={logo}
            alt=""
            className="size-16 rounded-2xl bg-surface object-contain p-1.5 shadow-[var(--shadow-soft)] ring-4 ring-surface"
          />
        ) : (
          <span className="kashi-tile grid size-16 place-items-center bg-surface text-2xl font-black text-accent-text shadow-[var(--shadow-soft)] ring-4 ring-surface">
            {[...v.name][0]}
          </span>
        )}
      </div>
      <div className="px-5 pt-3">
        <h2 className="truncate text-lg font-bold">{v.name}</h2>
        <p className="text-xs text-fg-muted">
          {t(`kinds.${v.kind}`)}
          {plan && plan.kind !== "free" ? (
            <>
              {" · "}
              <span className={cn(plan.kind === "expired" && "font-semibold text-danger")}>
                {plan.kind === "trial"
                  ? tw("planTrial", { plan: planName(plan, t), days: plan.daysLeft })
                  : plan.kind === "expired"
                    ? tw("planExpired", { plan: planName(plan, t) })
                    : planName(plan, t)}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden border-y border-border bg-border text-center">
        <div className="bg-surface px-2 py-3">
          <dt className="text-[11px] text-fg-muted">{tw("today")}</dt>
          <dd
            className="mt-0.5 truncate text-sm font-bold tabular-nums"
            title={v.revenueCents != null ? money(v.revenueCents) : undefined}
          >
            {v.revenueCents != null ? big(v.revenueCents) : "—"}
          </dd>
        </div>
        <div className="bg-surface px-2 py-3">
          <dt className="text-[11px] text-fg-muted">{tw("live")}</dt>
          <dd className={cn("mt-0.5 text-sm font-bold tabular-nums", v.liveOrders > 0 && "text-accent-text")}>
            {v.liveOrders}
          </dd>
        </div>
        <div className="bg-surface px-2 py-3">
          <dt className="text-[11px] text-fg-muted">{tw("tables")}</dt>
          <dd className="mt-0.5 text-sm font-bold tabular-nums">{v.openTables}</dd>
        </div>
      </dl>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {shortcuts.length ? (
          <div className="grid grid-cols-4 gap-1.5">
            {shortcuts.map((s) => (
              <Link
                key={s.screen}
                href={s.href}
                className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold text-fg-muted transition-colors hover:bg-accent-soft hover:text-accent-text"
              >
                <s.icon className="size-5" aria-hidden="true" />
                <span className="w-full truncate text-center">{s.label}</span>
              </Link>
            ))}
          </div>
        ) : null}
        <Link
          href={v.href}
          className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent font-bold text-accent-fg transition-transform active:scale-[0.98]"
        >
          {tw("open")}
          <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function planName(p: { planCode: string; planName: string }, t: T) {
  return planLabel(p.planCode, p.planName, t);
}
