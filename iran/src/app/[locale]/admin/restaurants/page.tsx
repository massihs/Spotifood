import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listRestaurantsForAdmin } from "@/server/modules/admin/service";
import { endOfferAction, grantPlanAction, offerPlanAction, setRestaurantStatusAction } from "../actions";
import { DateInput } from "@/components/ui/date-input";
import {
  adminListPlans,
  offersByOrganization,
  subscriptionsByOrganization,
} from "@/server/modules/billing/service";

/** A day from now ("YYYY-MM-DD"), for the offer's default end. */
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export default function AdminRestaurantsPage({ searchParams }: PageProps<"/[locale]/admin/restaurants">) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <RestaurantsTable searchParams={searchParams} />
    </Suspense>
  );
}

async function RestaurantsTable({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/admin/restaurants">["searchParams"];
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const status = sp.status === "active" || sp.status === "suspended" ? sp.status : undefined;
  const [t, tc, format, rows, plans] = await Promise.all([
    getTranslations("admin"),
    getTranslations("common"),
    getFormatter(),
    listRestaurantsForAdmin(db, { q, status }),
    adminListPlans(db),
  ]);
  const [subs, offers] = await Promise.all([
    subscriptionsByOrganization(
      db,
      rows.map((r) => r.organizationId),
    ),
    offersByOrganization(
      db,
      rows.map((r) => r.organizationId),
    ),
  ]);
  const inMonth = inDays(30);
  const subLine = (orgId: string) => {
    const s = subs.get(orgId);
    if (!s || s.kind === "free") return t("plans.stateFree");
    const d = (x: Date) => format.dateTime(x, { dateStyle: "medium" });
    if (s.kind === "trial") return t("plans.stateTrial", { plan: s.planName, date: d(s.endsAt) });
    if (s.kind === "expired") return t("plans.stateExpired", { plan: s.planName, date: d(s.endedAt) });
    return s.endsAt ? t("plans.statePaid", { plan: s.planName, date: d(s.endsAt) }) : s.planName;
  };

  return (
    <>
      <PageHeader title={t("restaurants.title")} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("restaurants.searchPlaceholder")}
          className="max-w-xs"
          aria-label={t("restaurants.searchPlaceholder")}
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          aria-label={t("restaurants.all")}
        >
          <option value="">{t("restaurants.all")}</option>
          <option value="active">{t("status.active")}</option>
          <option value="suspended">{t("status.suspended")}</option>
        </select>
        <Button type="submit" variant="secondary" className="h-11">
          {tc("search")}
        </Button>
      </form>
      {rows.length === 0 ? (
        <Card className="px-6 py-12 text-center text-fg-muted">{t("restaurants.empty")}</Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="flex h-full flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/dashboard/${r.id}`} className="min-w-0 hover:underline">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="truncate text-xs text-fg-subtle">
                      {r.organizationName} · /{r.slug} ·{" "}
                      {format.dateTime(r.createdAt, { dateStyle: "medium" })}
                    </p>
                  </Link>
                  <Badge tone={r.status === "active" ? "success" : "danger"}>{t(`status.${r.status}`)}</Badge>
                </div>
                <p className="text-sm">
                  <span className="text-fg-muted">{t("plans.current")}</span> {subLine(r.organizationId)}
                </p>
                {offers.get(r.organizationId) ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-text">
                    <span className="font-semibold">
                      {(() => {
                        const o = offers.get(r.organizationId)!;
                        return o.endsAt
                          ? t("plans.offerRunning", {
                              plan: o.planName,
                              date: format.dateTime(o.endsAt, { dateStyle: "medium" }),
                            })
                          : t("plans.offerRunningNoEnd", { plan: o.planName });
                      })()}
                    </span>
                    {offers.get(r.organizationId)!.note ? (
                      <span className="text-xs opacity-80">· {offers.get(r.organizationId)!.note}</span>
                    ) : null}
                    <form action={endOfferAction} className="ms-auto">
                      <input type="hidden" name="restaurantId" value={r.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        {t("plans.offerEnd")}
                      </Button>
                    </form>
                  </div>
                ) : null}
                <details className="rounded-xl bg-surface-2 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">{t("plans.offer")}</summary>
                  <p className="mt-2 text-xs text-fg-muted">{t("plans.offerHint")}</p>
                  <form action={offerPlanAction} className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="restaurantId" value={r.id} />
                    <select
                      name="planCode"
                      defaultValue={plans.find((p) => p.code !== "free")?.code}
                      className="h-10 rounded-lg border border-border bg-surface px-2 sm:col-span-2"
                      aria-label={t("plans.title")}
                    >
                      {plans.map((p) => (
                        <option key={p.id} value={p.code}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <Input
                      name="amount"
                      type="number"
                      min={1}
                      max={3650}
                      defaultValue="1"
                      className="h-10"
                      aria-label={t("plans.offerAmount")}
                    />
                    <select
                      name="unit"
                      defaultValue="months"
                      className="h-10 rounded-lg border border-border bg-surface px-2"
                      aria-label={t("plans.months")}
                    >
                      {(["days", "weeks", "months", "until", "forever"] as const).map((u) => (
                        <option key={u} value={u}>
                          {t(`plans.unit.${u}`)}
                        </option>
                      ))}
                    </select>
                    <label className="text-xs text-fg-muted sm:col-span-2">
                      {t("plans.offerUntil")}
                      <DateInput name="until" defaultValue={inMonth} className="mt-1" />
                    </label>
                    <Input
                      name="note"
                      maxLength={200}
                      placeholder={t("plans.offerNote")}
                      className="h-10 sm:col-span-2"
                    />
                    <Button type="submit" size="sm" className="sm:col-span-2">
                      {t("plans.offerApply")}
                    </Button>
                  </form>
                </details>
                <details className="rounded-xl bg-surface-2 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">{t("plans.grant")}</summary>
                  <form action={grantPlanAction} className="mt-3 grid gap-2 sm:grid-cols-3">
                    <input type="hidden" name="restaurantId" value={r.id} />
                    <select
                      name="planCode"
                      className="h-10 rounded-lg border border-border bg-surface px-2"
                      aria-label={t("plans.title")}
                    >
                      {plans.map((p) => (
                        <option key={p.id} value={p.code}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      name="months"
                      defaultValue="1"
                      className="h-10 rounded-lg border border-border bg-surface px-2"
                      aria-label={t("plans.months")}
                    >
                      <option value="0">{t("plans.noEnd")}</option>
                      {[1, 3, 6, 12].map((m) => (
                        <option key={m} value={m}>
                          {t("plans.monthsN", { count: m })}
                        </option>
                      ))}
                    </select>
                    <Input
                      name="amount"
                      inputMode="numeric"
                      placeholder={t("plans.amount")}
                      className="h-10"
                    />
                    <Button type="submit" size="sm" variant="secondary" className="sm:col-span-3">
                      {t("plans.apply")}
                    </Button>
                  </form>
                </details>
                <div className="mt-auto flex items-center gap-2">
                  <span className="text-sm text-fg-muted">
                    {t("restaurants.orders")}{" "}
                    <span className="font-semibold text-fg tabular-nums">{r.ordersCount}</span>
                  </span>
                  <form action={setRestaurantStatusAction} className="ms-auto">
                    <input type="hidden" name="restaurantId" value={r.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={r.status === "active" ? "suspended" : "active"}
                    />
                    <Button type="submit" size="sm" variant={r.status === "active" ? "ghost" : "secondary"}>
                      {r.status === "active" ? t("restaurants.suspend") : t("restaurants.reactivate")}
                    </Button>
                  </form>
                  <Link href={`/dashboard/${r.id}`} className={buttonClasses("primary", "sm")}>
                    {t("restaurants.open")}
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
