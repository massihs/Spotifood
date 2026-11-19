import { daysAgo } from "@/lib/days";
import { Suspense } from "react";
import { Search, Star, TrendingUp, UserRound, Users, Wallet } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import {
  CampaignForm,
  CouponList,
  LoyaltySettings,
  NewCustomerButton,
} from "@/components/customers/customers-ui";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import {
  AUDIENCES,
  countAudience,
  customerStats,
  listCampaigns,
  listCoupons,
  listCustomers,
  loyaltyConfig,
  type Audience,
} from "@/server/modules/customers/service";
import { can } from "@/server/tenancy";
import { EmptyState } from "@/components/ui/empty-state";
import { AnnounceDish, AutomationsForm } from "@/components/customers/automations-ui";
import {
  automationResults,
  birthdaysKnown,
  defaultTexts,
  getAutomations,
  recentDishes,
} from "@/server/modules/marketing/automations";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/customers">;
const TABS = ["customers", "coupons", "campaigns", "automations", "loyalty"] as const;

export default function CustomersPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <Customers params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Customers({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "customers.view", "customers");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.tab))
    ? (sp.tab as (typeof TABS)[number])
    : "customers";
  const [t, format, locale] = await Promise.all([getTranslations("customers"), getFormatter(), getLocale()]);
  const manage = can(ctx, "customers.manage");
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/customers`;
  const cur = ctx.restaurant.currency;
  const money = (c: number) => formatMoney(c, cur, locale);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={manage && tab === "customers" ? <NewCustomerButton rid={rid} /> : null}
      />
      <nav
        className="-mx-4 mb-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4"
        aria-label={t("title")}
      >
        {TABS.map((k) => (
          <Link
            key={k}
            href={k === "customers" ? base : `${base}?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap",
              tab === k ? "bg-accent text-accent-fg" : "bg-surface text-fg-muted ring-1 ring-border",
            )}
          >
            {t(`tabs.${k}`)}
          </Link>
        ))}
      </nav>

      {tab === "customers" ? (
        <CustomerTab
          rid={rid}
          q={typeof sp.q === "string" ? sp.q : ""}
          segment={(AUDIENCES as readonly string[]).includes(String(sp.s)) ? (sp.s as Audience) : "all"}
          money={money}
          date={(d) => format.relativeTime(d)}
          ctx={ctx}
        />
      ) : null}
      {tab === "coupons" ? (
        <CouponList rid={rid} coupons={await listCoupons(db, ctx)} currency={cur} canManage={manage} />
      ) : null}
      {tab === "campaigns" ? (
        <div className="space-y-4">
          {manage ? (
            <CampaignForm
              rid={rid}
              restaurantName={ctx.restaurant.name}
              counts={await countAudience(db, ctx)}
            />
          ) : null}
          <Card>
            <p className="border-b border-border px-4 py-3 font-semibold">{t("history")}</p>
            <ul className="divide-y divide-border">
              {(await listCampaigns(db, ctx)).map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <p className="line-clamp-2 text-sm">{c.message}</p>
                  <p className="mt-1 text-xs text-fg-muted">
                    {t(`audiences.${c.audience}`)} · {t("sentOf", { sent: c.sent, total: c.recipients })} ·{" "}
                    {format.dateTime(c.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
      {tab === "automations"
        ? await (async () => {
            const since = daysAgo(30);
            const [settings, defaults, results, known, dishes] = await Promise.all([
              getAutomations(db, rid),
              defaultTexts(ctx.restaurant.defaultLocale),
              automationResults(db, ctx, since),
              birthdaysKnown(db, ctx),
              recentDishes(db, rid),
            ]);
            const ta = await getTranslations("automations");
            return (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {results.map((r) => (
                    <Card key={r.kind} className="p-4">
                      <p className="text-sm font-semibold">{ta(`results.${r.kind}`)}</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums">{money(r.revenueCents)}</p>
                      <p className="text-xs text-fg-muted">
                        {ta("results.line", { sent: r.sent, guests: r.guests, orders: r.orders })}
                      </p>
                    </Card>
                  ))}
                </div>
                <p className="text-sm text-fg-muted">{ta("hint", { known })}</p>
                <div className="grid gap-4 lg:grid-cols-2">
                  <AutomationsForm
                    rid={rid}
                    initial={settings}
                    defaults={{ birthday: defaults.birthday, winback: defaults.winback }}
                    canManage={manage}
                  />
                  {manage && dishes.length ? (
                    <AnnounceDish rid={rid} dishes={dishes} defaultText={defaults.newDish} />
                  ) : null}
                </div>
              </div>
            );
          })()
        : null}
      {tab === "loyalty" ? (
        <LoyaltySettings rid={rid} currency={cur} initial={await loyaltyConfig(db, rid)} canManage={manage} />
      ) : null}
    </>
  );
}

async function CustomerTab({
  rid,
  q,
  segment,
  money,
  date,
  ctx,
}: {
  rid: string;
  q: string;
  segment: Audience;
  money: (c: number) => string;
  date: (d: Date) => string;
  ctx: Awaited<ReturnType<typeof requireRestaurant>>;
}) {
  const [t, locale] = await Promise.all([getTranslations("customers"), getLocale()]);
  const [stats, rows] = await Promise.all([customerStats(db, ctx), listCustomers(db, ctx, { q, segment })]);
  const base = `/dashboard/${rid}/customers`;
  const num = (v: number) => new Intl.NumberFormat(locale).format(v);
  const monthAgo = since(30);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            [t("statTotal"), num(stats.total), Users, TONE[0]],
            [t("statActive"), num(stats.active), TrendingUp, TONE[1]],
            [t("statPoints"), num(stats.points), Star, TONE[2]],
            [t("statSpent"), money(stats.spent), Wallet, TONE[3]],
          ] as const
        ).map(([k, v, Icon, tone]) => (
          <div
            key={k}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
          >
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tone)}>
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-fg-muted">{k}</span>
              <span className="block text-base font-bold break-words tabular-nums sm:text-lg">{v}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action={base} className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            name="q"
            defaultValue={q}
            placeholder={t("search")}
            className="h-10 w-full rounded-full border border-border-strong bg-surface ps-9 pe-3 text-sm"
          />
          {segment !== "all" ? <input type="hidden" name="s" value={segment} /> : null}
        </form>
        {AUDIENCES.map((a) => (
          <Link
            key={a}
            href={a === "all" ? base : `${base}?s=${a}`}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              segment === a ? "bg-fg text-bg" : "bg-surface text-fg-muted ring-1 ring-border",
            )}
          >
            {t(`audiences.${a}`)}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Users />} title={t("noCustomers")} description={t("noCustomersHint")} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="hidden grid-cols-[minmax(0,1fr)_7rem_8rem_9rem_5rem] gap-3 border-b border-border bg-surface-2/60 px-4 py-2.5 text-xs font-semibold text-fg-muted md:grid">
            <span>{t("col.customer")}</span>
            <span className="text-end">{t("col.orders")}</span>
            <span className="text-end">{t("col.last")}</span>
            <span className="text-end">{t("col.spent")}</span>
            <span className="text-end">{t("col.points")}</span>
          </div>
          <ul className="divide-y divide-border">
            {rows.map((c) => {
              const inactive = !c.lastOrderAt || c.lastOrderAt < monthAgo;
              const fresh = c.createdAt >= monthAgo && c.ordersCount <= 1;
              const owes = c.creditLimitCents != null && c.balanceCents > 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`${base}/${c.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 md:grid-cols-[minmax(0,1fr)_7rem_8rem_9rem_5rem]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "grid size-11 shrink-0 place-items-center rounded-2xl text-sm font-bold",
                          TONE[hash(c.phone) % TONE.length],
                        )}
                        aria-hidden="true"
                      >
                        {c.name ? initials(c.name) : <UserRound className="size-5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-semibold">{c.name ?? t("unnamed")}</span>
                          {c.isBusiness ? <Chip tone="bg-tone-indigo/12 text-tone-indigo">B2B</Chip> : null}
                          {c.ordersCount >= 5 ? (
                            <Chip tone="bg-warning-soft text-warning">{t("badge.loyal")}</Chip>
                          ) : null}
                          {fresh ? <Chip tone="bg-success-soft text-success">{t("badge.new")}</Chip> : null}
                          {!fresh && inactive ? (
                            <Chip tone="bg-surface-2 text-fg-muted">{t("badge.inactive")}</Chip>
                          ) : null}
                          {owes ? (
                            <Chip tone="bg-danger-soft text-danger">
                              {t("badge.owes", { amount: money(c.balanceCents) })}
                            </Chip>
                          ) : null}
                        </span>
                        <span dir="ltr" className="block text-start text-xs text-fg-muted tabular-nums">
                          {c.phone}
                        </span>
                      </span>
                    </span>
                    <span className="hidden text-end text-sm tabular-nums md:block">
                      {num(c.ordersCount)}
                    </span>
                    <span className="hidden text-end text-sm text-fg-muted md:block">
                      {c.lastOrderAt ? date(c.lastOrderAt) : "—"}
                    </span>
                    <span className="text-end">
                      <span className="block text-sm font-bold tabular-nums">{money(c.totalSpentCents)}</span>
                      <span className="block text-xs text-fg-muted md:hidden">
                        {t("ordersCount", { count: c.ordersCount })}
                      </span>
                    </span>
                    <span className="hidden items-center justify-end gap-1 text-sm font-semibold text-warning tabular-nums md:flex">
                      <Star className="size-3.5 fill-current" aria-hidden="true" />
                      {num(c.points)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

const TONE = [
  "bg-tone-orange/12 text-tone-orange",
  "bg-tone-emerald/12 text-tone-emerald",
  "bg-tone-amber/18 text-tone-amber",
  "bg-tone-indigo/12 text-tone-indigo",
  "bg-tone-rose/12 text-tone-rose",
  "bg-tone-sky/12 text-tone-sky",
  "bg-tone-violet/12 text-tone-violet",
];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const since = (days: number) => new Date(Date.now() - days * 86_400_000);

/** Two initials for the avatar ("نگار کریمی" → "نک"). */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts)
    .map((p) => [...p][0] ?? "")
    .join("")
    .toUpperCase();
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap", tone)}>
      {children}
    </span>
  );
}
