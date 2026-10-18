import {
  ArrowUpLeft,
  Check,
  ChefHat,
  LayoutGrid,
  QrCode,
  ReceiptText,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card, CardHeader, StatCard, TONE_TILE, type Tone } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getSetupOverview, getTodayStats } from "@/server/modules/dashboard/service";
import { can } from "@/server/tenancy";

export default function OverviewPage({ params }: PageProps<"/[locale]/dashboard/[restaurantId]">) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      }
    >
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<"/[locale]/dashboard/[restaurantId]">["params"] }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId);
  const [t, locale, overview, today] = await Promise.all([
    getTranslations("dashboard"),
    getLocale(),
    getSetupOverview(db, ctx),
    getTodayStats(db, ctx),
  ]);
  const money = (c: number) => formatMoney(c, ctx.restaurant.currency, locale);
  const base = `/dashboard/${ctx.restaurant.id}`;

  const steps = [
    { key: "profile", done: overview.profileComplete, href: `${base}/settings` },
    { key: "tables", done: overview.tables > 0, href: `${base}/tables` },
    { key: "menu", done: overview.products > 0, href: `${base}/menu` },
    { key: "payments", done: false, href: `${base}/settings` },
  ] as const;
  const doneCount = steps.filter((s) => s.done).length;

  // Last 7 days, oldest first, zero-filled.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.asOf.getTime() - (6 - i) * 86_400_000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.restaurant.timezone }).format(d);
    return {
      key,
      label: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: ctx.restaurant.timezone }).format(
        d,
      ),
      cents: today.revenueByDay.find((r) => r.day === key)?.cents ?? 0,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.cents));

  const quick = [
    can(ctx, "orders.view") && {
      href: `${base}/kitchen`,
      label: t("quickActions.kitchen"),
      Icon: ChefHat,
      tone: "orange" as Tone,
    },
    can(ctx, "tables.view") && {
      href: `${base}/floor`,
      label: t("quickActions.floor"),
      Icon: LayoutGrid,
      tone: "teal" as Tone,
    },
    can(ctx, "menu.view") && {
      href: `${base}/menu`,
      label: t("quickActions.menu"),
      Icon: UtensilsCrossed,
      tone: "rose" as Tone,
    },
    can(ctx, "tables.view") && {
      href: `${base}/tables`,
      label: t("quickActions.qr"),
      Icon: QrCode,
      tone: "sky" as Tone,
    },
  ].filter((x) => !!x);

  return (
    <>
      <PageHeader
        title={t("welcome", { name: ctx.user.fullName.split(" ")[0] ?? "" })}
        description={t("overviewSubtitle")}
      />

      {/* Today */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card
          className="overflow-hidden border-transparent p-6 text-white shadow-accent"
          style={{ background: "var(--brand-gradient)" }}
        >
          <div
            className="pointer-events-none absolute -end-16 -top-20 size-64 rounded-full bg-white/10"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute start-1/3 -bottom-24 size-56 rounded-full bg-white/[0.06]"
            aria-hidden="true"
          />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium opacity-80">{t("revenueToday")}</p>
              <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">
                {money(today.revenueTodayCents)}
              </p>
            </div>
            <span className="grid size-11 place-items-center rounded-2xl bg-white/18" aria-hidden="true">
              <Wallet className="size-5" />
            </span>
          </div>
          <div className="relative mt-6">
            <p className="text-xs font-medium opacity-75">{t("last7")}</p>
            <div className="mt-3 flex h-28 items-end gap-2">
              {days.map((d, i) => (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={cn("w-full rounded-lg", i === 6 ? "bg-white" : "bg-white/30")}
                    style={{ height: `${Math.max(6, (d.cents / max) * 88)}px` }}
                    title={money(d.cents)}
                  />
                  <span className="text-[10px] opacity-75">{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <StatCard label={t("ordersToday")} value={today.ordersToday} icon={<ReceiptText />} tone="sky" />
          <StatCard label={t("inKitchen")} value={today.inKitchen} icon={<ChefHat />} tone="orange" />
          <StatCard label={t("openTables")} value={today.openTables} icon={<LayoutGrid />} tone="teal" />
          <StatCard label={t("stats.tables")} value={overview.tables} icon={<QrCode />} tone="fuchsia" />
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Quick access */}
        <Card>
          <CardHeader title={t("quick")} />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            {quick.map(({ href, label, Icon, tone }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col gap-3 rounded-xl border border-border p-4 transition-colors hover:border-accent/40 hover:bg-accent-soft/50"
              >
                <span className="flex items-center justify-between">
                  <span className={cn("grid size-10 place-items-center rounded-xl", TONE_TILE[tone])}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <ArrowUpLeft
                    className="size-4 text-fg-subtle transition-colors group-hover:text-fg ltr:-scale-x-100"
                    aria-hidden="true"
                  />
                </span>
                <span className="text-sm font-medium">{label}</span>
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-3 border-t border-border text-center">
            {[
              { label: t("stats.categories"), value: overview.categories, Icon: UtensilsCrossed },
              { label: t("stats.products"), value: overview.products, Icon: Wallet },
              { label: t("stats.members"), value: overview.members, Icon: Users },
            ].map(({ label, value }) => (
              <div key={label} className="px-3 py-4">
                <p className="text-lg font-semibold tabular-nums">{value}</p>
                <p className="text-xs text-fg-muted">{label}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Setup checklist */}
        <Card>
          <CardHeader
            title={t("setupTitle")}
            description={doneCount === steps.length ? t("setupDone") : t("setupSubtitle")}
            action={
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-text tabular-nums">
                {doneCount}/{steps.length}
              </span>
            }
          />
          <div className="px-5 pt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
          </div>
          <ol className="p-3">
            {steps.map((s, i) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2"
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                      s.done ? "bg-accent text-accent-fg" : "text-fg-muted ring-1 ring-border-strong",
                    )}
                    aria-hidden="true"
                  >
                    {s.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={cn("text-sm", s.done && "text-fg-muted line-through")}>
                    {t(`setup.${s.key}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
