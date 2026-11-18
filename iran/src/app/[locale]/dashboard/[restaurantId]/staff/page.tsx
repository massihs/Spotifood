import { Suspense } from "react";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  HandCoins,
  UsersRound,
  Wallet,
} from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Kpi } from "@/components/reports/report-parts";
import {
  AddShiftButton,
  CopyWeekButton,
  DeleteTipsButton,
  ElapsedSince,
  EntryButton,
  RateInput,
  ShiftChip,
  TipsForm,
} from "@/components/staff/staff-ui";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { dayStart, localDay, PRESETS, resolvePeriod } from "@/lib/period";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listMembers } from "@/server/modules/members/service";
import { listEntries, listPlanned, onShiftNow, payroll } from "@/server/modules/staff/service";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/staff">;
const TABS = ["now", "planning", "clock", "payroll"] as const;
type Tab = (typeof TABS)[number];
const ICONS = { now: UsersRound, planning: CalendarRange, clock: Clock3, payroll: Wallet } as const;
const DAY = 86_400_000;

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export default function StaffPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <Staff params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Staff({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "members.manage", "staff");
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : "now";
  const [t, format, locale, members] = await Promise.all([
    getTranslations("staff"),
    getFormatter(),
    getLocale(),
    listMembers(db, ctx),
  ]);
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const cur = ctx.restaurant.currency;
  const base = `/dashboard/${rid}/staff`;
  const today = localDay(new Date(), tz);
  const people = members
    .filter((m) => m.status === "active")
    .map((m) => ({ userId: m.userId, name: m.fullName }));
  const money = (c: number) => formatMoney(c, cur, locale);
  const n = (v: number, d = 0) =>
    v.toLocaleString(locale === "fa" ? "fa-IR" : locale, { maximumFractionDigits: d });
  const time = (d: Date) => format.dateTime(d, { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const dayLabel = (d: Date | string) =>
    format.dateTime(typeof d === "string" ? new Date(`${d}T12:00:00Z`) : d, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: typeof d === "string" ? "UTC" : tz,
    });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <nav className="-mx-4 mb-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4">
        {TABS.map((k) => {
          const Icon = ICONS[k];
          return (
            <Link
              key={k}
              href={k === "now" ? base : `${base}?tab=${k}`}
              aria-current={tab === k ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap",
                tab === k ? "bg-accent text-accent-fg" : "bg-surface text-fg-muted ring-1 ring-border",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(`tabs.${k}`)}
            </Link>
          );
        })}
      </nav>

      {tab === "now"
        ? await (async () => {
            const on = await onShiftNow(db, ctx);
            const dayRange = { from: dayStart(today, tz), to: dayStart(addDays(today, 1), tz) };
            const planned = await listPlanned(db, ctx, dayRange);
            const name = (id: string) => people.find((p) => p.userId === id)?.name ?? "—";
            return (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <p className="border-b border-border px-4 py-3 font-semibold">
                    {t("now.working", { n: n(on.length) })}
                  </p>
                  {on.length ? (
                    <ul className="divide-y divide-border">
                      {on.map((e) => (
                        <li key={e.userId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <span className="size-2 rounded-full bg-success" aria-hidden="true" />
                          <span className="flex-1 font-medium">{e.name}</span>
                          <span className="text-xs text-fg-muted">
                            {t("now.since", { time: time(e.since) })}
                          </span>
                          <ElapsedSince since={e.since.toISOString()} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      size="sm"
                      className="m-3"
                      icon={<Clock3 />}
                      title={t("now.nobody")}
                      description={t("now.nobodyHint")}
                    />
                  )}
                </Card>
                <Card>
                  <p className="border-b border-border px-4 py-3 font-semibold">{t("now.planned")}</p>
                  {planned.length ? (
                    <ul className="divide-y divide-border">
                      {planned.map((p) => {
                        const here = on.some((o) => o.userId === p.userId);
                        const late =
                          !here &&
                          p.startsAt.getTime() < Date.now() - 5 * 60_000 &&
                          p.endsAt.getTime() > Date.now();
                        return (
                          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                            <span className="flex-1 font-medium">{name(p.userId)}</span>
                            <span dir="ltr" className="text-xs text-fg-muted tabular-nums">
                              {time(p.startsAt)} – {time(p.endsAt)}
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-semibold",
                                here
                                  ? "bg-success-soft text-success"
                                  : late
                                    ? "bg-danger-soft text-danger"
                                    : "bg-surface-2 text-fg-muted",
                              )}
                            >
                              {here ? t("now.here") : late ? t("now.late") : t("now.expected")}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <EmptyState
                      size="sm"
                      className="m-3"
                      icon={<CalendarRange />}
                      title={t("now.noPlan")}
                      action={
                        <Link
                          href={`${base}?tab=planning`}
                          className="text-sm font-semibold text-accent-text underline"
                        >
                          {t("now.openPlanning")}
                        </Link>
                      }
                    />
                  )}
                </Card>
                <p className="text-sm text-fg-muted lg:col-span-2">{t("now.howTo")}</p>
              </div>
            );
          })()
        : null}

      {tab === "planning"
        ? await (async () => {
            // Weeks start on Saturday in Iran, on Monday elsewhere.
            const firstDow = cur === "IRR" ? 6 : 1;
            const ref = typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today;
            const dow = new Date(`${ref}T12:00:00Z`).getUTCDay();
            const weekStart = addDays(ref, -((dow - firstDow + 7) % 7));
            const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
            const shifts = await listPlanned(db, ctx, {
              from: dayStart(weekStart, tz),
              to: dayStart(addDays(weekStart, 7), tz),
            });
            const hoursOf = (uid: string) =>
              shifts
                .filter((s) => s.userId === uid)
                .reduce((h, s) => h + (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000, 0);
            return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`${base}?tab=planning&week=${addDays(weekStart, -7)}`}
                    className="grid size-10 place-items-center rounded-full ring-1 ring-border"
                    aria-label="‹"
                  >
                    <ChevronRight className="size-4 ltr:rotate-180" />
                  </Link>
                  <p className="min-w-40 text-center font-semibold">
                    {dayLabel(days[0]!)} – {dayLabel(days[6]!)}
                  </p>
                  <Link
                    href={`${base}?tab=planning&week=${addDays(weekStart, 7)}`}
                    className="grid size-10 place-items-center rounded-full ring-1 ring-border"
                    aria-label="›"
                  >
                    <ChevronLeft className="size-4 ltr:rotate-180" />
                  </Link>
                  <div className="ms-auto flex flex-wrap gap-2">
                    {!shifts.length ? <CopyWeekButton rid={rid} weekStart={weekStart} /> : null}
                    <AddShiftButton
                      rid={rid}
                      members={people}
                      day={days.includes(today) ? today : weekStart}
                    />
                  </div>
                </div>
                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[860px] table-fixed text-sm">
                    <thead className="bg-surface-2 text-xs text-fg-muted">
                      <tr>
                        <th className="w-40 px-3 py-2 text-start font-medium">{t("planning.person")}</th>
                        {days.map((d) => (
                          <th
                            key={d}
                            className={cn(
                              "px-1.5 py-2 text-center font-medium",
                              d === today && "text-accent-text",
                            )}
                          >
                            {dayLabel(d)}
                          </th>
                        ))}
                        <th className="w-16 px-2 py-2 text-end font-medium">{t("planning.hours")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {people.map((p) => (
                        <tr key={p.userId}>
                          <td className="truncate px-3 py-2 font-medium">{p.name}</td>
                          {days.map((d) => {
                            const mine = shifts.filter(
                              (s) => s.userId === p.userId && localDay(s.startsAt, tz) === d,
                            );
                            return (
                              <td
                                key={d}
                                className={cn(
                                  "space-y-1 px-1 py-1.5 align-top",
                                  d === today && "bg-accent-soft/30",
                                )}
                              >
                                {mine.map((s) => (
                                  <ShiftChip
                                    key={s.id}
                                    rid={rid}
                                    id={s.id}
                                    note={s.note}
                                    label={`${time(s.startsAt)}–${time(s.endsAt)}`}
                                  />
                                ))}
                                <AddShiftButton
                                  rid={rid}
                                  members={people}
                                  day={d}
                                  userId={p.userId}
                                  compact
                                />
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-end font-semibold tabular-nums">
                            {n(hoursOf(p.userId), 1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
                <p className="text-xs text-fg-muted">{t("planning.hint")}</p>
              </div>
            );
          })()
        : null}

      {tab === "clock" || tab === "payroll"
        ? await (async () => {
            const period = resolvePeriod(sp.p || sp.from ? sp : { ...sp, p: "7d" }, tz, cur === "IRR");
            const range = { from: period.from, to: period.to };
            const qs = (p: string) => `${base}?tab=${tab}&p=${p}`;
            const presets = (
              <div className="-mx-4 mb-3 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4">
                {PRESETS.filter((p) => p !== "custom").map((p) => (
                  <Link
                    key={p}
                    href={qs(p)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1.5 text-sm whitespace-nowrap",
                      period.preset === p ? "bg-fg text-bg" : "bg-surface text-fg-muted ring-1 ring-border",
                    )}
                  >
                    {t(`presets.${p}`)}
                  </Link>
                ))}
              </div>
            );
            if (tab === "clock") {
              const entries = await listEntries(db, ctx, range);
              return (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {presets}
                    <EntryButton rid={rid} members={people} today={today} />
                  </div>
                  <Card>
                    {entries.length ? (
                      <ul className="divide-y divide-border">
                        {entries.map((e) => {
                          const h =
                            ((e.clockOutAt ?? new Date()).getTime() - e.clockInAt.getTime()) / 3_600_000;
                          return (
                            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                              <span className="min-w-32 flex-1 font-medium">{e.name}</span>
                              <span className="w-28 text-xs text-fg-muted">{dayLabel(e.clockInAt)}</span>
                              <span dir="ltr" className="w-32 tabular-nums">
                                {time(e.clockInAt)} – {e.clockOutAt ? time(e.clockOutAt) : "…"}
                              </span>
                              <span
                                className={cn(
                                  "w-16 text-end font-semibold tabular-nums",
                                  !e.clockOutAt && "text-success",
                                )}
                              >
                                {n(h, 1)} {t("h")}
                              </span>
                              {e.edited ? (
                                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">
                                  {t("clock.edited")}
                                </span>
                              ) : null}
                              {e.note ? <span className="text-xs text-fg-muted">{e.note}</span> : null}
                              <EntryButton
                                rid={rid}
                                members={people}
                                today={today}
                                entry={{
                                  id: e.id,
                                  userId: e.userId,
                                  day: localDay(e.clockInAt, tz),
                                  start: hhmm(e.clockInAt, tz),
                                  end: e.clockOutAt ? hhmm(e.clockOutAt, tz) : "",
                                  note: e.note ?? "",
                                }}
                              />
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <EmptyState
                        size="sm"
                        className="m-3"
                        icon={<Clock3 />}
                        title={t("clock.empty")}
                        description={t("clock.emptyHint")}
                      />
                    )}
                  </Card>
                </div>
              );
            }
            const pay = await payroll(db, ctx, range);
            return (
              <div className="space-y-4">
                {presets}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Kpi label={t("payroll.hours")} value={n(pay.totals.hours, 1)} />
                  <Kpi label={t("payroll.pay")} value={money(pay.totals.payCents)} />
                  <Kpi label={t("payroll.tips")} value={money(pay.totals.tipsCents)} />
                  <Kpi label={t("payroll.total")} value={money(pay.totals.payCents + pay.totals.tipsCents)} />
                </div>
                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-surface-2 text-xs text-fg-muted">
                      <tr>
                        <th className="px-4 py-2 text-start font-medium">{t("payroll.person")}</th>
                        <th className="px-4 py-2 text-end font-medium">{t("payroll.hours")}</th>
                        <th className="px-4 py-2 text-end font-medium">{t("payroll.rate")}</th>
                        <th className="px-4 py-2 text-end font-medium">{t("payroll.pay")}</th>
                        <th className="px-4 py-2 text-end font-medium">{t("payroll.tips")}</th>
                        <th className="px-4 py-2 text-end font-medium">{t("payroll.total")}</th>
                        <th className="px-4 py-2 text-start font-medium">{t("payroll.punctuality")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pay.rows.map((r) => (
                        <tr key={r.userId}>
                          <td className="px-4 py-2">
                            <p className="font-medium">{r.name}</p>
                            <p className="text-xs text-fg-muted">{t("payroll.shifts", { n: n(r.shifts) })}</p>
                          </td>
                          <td className="px-4 py-2 text-end tabular-nums">{n(r.hours, 1)}</td>
                          <td className="px-4 py-2 text-end">
                            <RateInput rid={rid} userId={r.userId} cents={r.rate} currency={cur} />
                          </td>
                          <td className="px-4 py-2 text-end tabular-nums">
                            {r.payCents != null ? money(r.payCents) : "—"}
                          </td>
                          <td className="px-4 py-2 text-end tabular-nums">
                            {r.tipsCents ? money(r.tipsCents) : "—"}
                          </td>
                          <td className="px-4 py-2 text-end font-bold tabular-nums">{money(r.totalCents)}</td>
                          <td className="px-4 py-2 text-xs">
                            {r.late.count ? (
                              <span className="me-1 rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning">
                                {t("payroll.late", { n: n(r.late.count), min: n(r.late.minutes) })}
                              </span>
                            ) : null}
                            {r.missed ? (
                              <span className="rounded-full bg-danger-soft px-2 py-0.5 font-semibold text-danger">
                                {t("payroll.missed", { n: n(r.missed) })}
                              </span>
                            ) : null}
                            {!r.late.count && !r.missed && r.planned ? (
                              <span className="text-success">{t("payroll.onTime")}</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="border-t border-border px-4 py-2.5 text-xs text-fg-muted">
                    {t("payroll.hint")}
                  </p>
                </Card>
                <Card className="space-y-3 p-4">
                  <div className="flex items-center gap-2">
                    <HandCoins className="size-5 text-accent" aria-hidden="true" />
                    <p className="font-semibold">{t("tips.title")}</p>
                  </div>
                  <p className="text-sm text-fg-muted">{t("tips.hint")}</p>
                  <TipsForm rid={rid} today={today} currency={cur} />
                  {pay.pools.length ? (
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {pay.pools.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <span className="w-28 text-fg-muted">{dayLabel(p.day)}</span>
                          <span className="flex-1 truncate text-fg-muted">{p.note}</span>
                          {pay.undistributedDays.includes(p.day) ? (
                            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">
                              {t("tips.nobody")}
                            </span>
                          ) : null}
                          <span className="font-semibold tabular-nums">{money(p.amountCents)}</span>
                          <DeleteTipsButton rid={rid} id={p.id} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
              </div>
            );
          })()
        : null}
    </>
  );
}

const hhmm = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
