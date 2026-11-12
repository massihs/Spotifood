import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { PrintButton } from "@/components/ui/print-button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db/client";
import type { RestaurantContext } from "@/server/tenancy";
import type { Range, SalesReport } from "@/server/modules/reports/service";
import {
  accountStatement,
  bankReport,
  chargesOnAccount,
  creditAccounts,
  dailySales,
  debtors,
  invoicesInPeriod,
  occupancy,
  openBills,
  salesPerPerson,
  salesPlans,
  upcomingGuests,
  walkIns,
  weekdaySales,
  type ReportSettings,
} from "@/server/modules/reports/center";
import { Bars, DailyChart, HourChart, Kpi, Row } from "./report-parts";
import { ReportSettingsForm } from "./reports-ui";

/** The time the report is read (outside the components, which must stay pure). */
const nowMs = () => Date.now();

export const CENTER_TABS = [
  "sales",
  "charts",
  "plans",
  "staff",
  "invoices",
  "accounts",
  "statement",
  "openBills",
  "debtors",
  "onAccount",
  "upcoming",
  "walkins",
  "occupancy",
  "bank",
  "full",
  "settings",
] as const;
export type CenterTab = (typeof CENTER_TABS)[number];

type Pnl = {
  revenueCents: number;
  taxCents: number;
  netSalesCents: number;
  cogsCents: number;
  grossCents: number;
  expensesCents: number;
  netCents: number;
  marginPct: number;
  expensesByCategory: { category: string; cents: number }[];
};

const th = "px-3 py-2.5 text-start text-xs font-semibold text-fg-muted";
const thEnd = "px-3 py-2.5 text-end text-xs font-semibold text-fg-muted";
const td = "px-3 py-2";
const tdNum = "px-3 py-2 text-end whitespace-nowrap tabular-nums";

function Table({ children, min = 640 }: { children: React.ReactNode; min?: number }) {
  return (
    <Card className="overflow-x-auto">
      <table
        className="w-full text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-border [&_tfoot]:border-t-2 [&_tfoot]:border-border [&_tfoot]:bg-surface-2/60 [&_tfoot]:font-bold [&_thead]:bg-surface-2"
        style={{ minWidth: min }}
      >
        {children}
      </table>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-fg-muted">
      {text}
    </p>
  );
}

/** The report centre's pages (the period is already the business-day range). */
export async function ReportCenter({
  tab,
  ctx,
  range,
  settings,
  sales,
  pnl,
  periodQs,
  customer,
}: {
  tab: CenterTab;
  ctx: RestaurantContext;
  range: Range;
  settings: ReportSettings;
  sales: SalesReport;
  pnl: Pnl;
  periodQs: string;
  customer?: string;
}) {
  const [t, tr, format, locale] = await Promise.all([
    getTranslations("reports.center"),
    getTranslations("reports"),
    getFormatter(),
    getLocale(),
  ]);
  const tz = ctx.restaurant.timezone;
  const cur = ctx.restaurant.currency;
  const rid = ctx.restaurant.id;
  const hour = settings.dayStartHour;
  const money = (c: number) => (c < 0 ? `−${formatMoney(-c, cur, locale)}` : formatMoney(c, cur, locale));
  const n = (v: number) => v.toLocaleString(locale === "fa" ? "fa-IR" : locale);
  const pct = (v: number) => `${n(Math.round(v * 1000) / 10)}%`;
  const day = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00Z`), {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const when = (d: Date | null) =>
    d ? format.dateTime(d, { dateStyle: "short", timeStyle: "short", timeZone: tz }) : "—";
  const weekday = (d: number) =>
    format.dateTime(new Date(Date.UTC(2024, 0, 7 + d, 12)), { weekday: "long", timeZone: "UTC" });
  const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const minutes = (m: number) => t("minutes", { n: m });
  const base = `/dashboard/${rid}/reports`;

  if (tab === "settings")
    return (
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">{t("settings.hint")}</p>
        <ReportSettingsForm
          rid={rid}
          dayStartHour={settings.dayStartHour}
          defaultPreset={settings.defaultPreset}
        />
      </div>
    );

  if (tab === "sales") {
    const d = await dailySales(db, ctx, range, hour);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label={tr("revenue")}
            value={money(d.total.totalCents)}
            hint={tr("ordersN", { count: d.total.orders })}
          />
          <Kpi label={tr("discounts")} value={money(d.total.discountCents)} />
          <Kpi label={tr("vat")} value={money(d.total.taxCents)} />
          <Kpi
            label={tr("cancelled")}
            value={n(sales.summary.cancelledOrders)}
            hint={money(sales.summary.cancelledCents)}
            tone={sales.summary.cancelledOrders ? "bad" : undefined}
          />
        </div>
        <Card className="p-4">
          <p className="mb-3 font-semibold">{tr("byHour")}</p>
          <HourChart rows={sales.hourly} />
        </Card>
        <Table min={1000}>
          <thead>
            <tr>
              <th className={th}>{t("col.day")}</th>
              <th className={thEnd}>{tr("orders")}</th>
              <th className={thEnd}>{tr("subtotal")}</th>
              <th className={thEnd}>{tr("discounts")}</th>
              <th className={thEnd}>{tr("vat")}</th>
              <th className={thEnd}>{t("col.total")}</th>
              <th className={thEnd}>{t("method.cash")}</th>
              <th className={thEnd}>{t("method.card")}</th>
              <th className={thEnd}>{t("method.online")}</th>
              <th className={thEnd}>{t("method.account")}</th>
              <th className={thEnd}>{t("col.avg")}</th>
            </tr>
          </thead>
          <tbody>
            {d.days.map((x) => (
              <tr key={x.day}>
                <td className={cn(td, "font-medium whitespace-nowrap")}>{day(x.day)}</td>
                <td className={tdNum}>{n(x.orders)}</td>
                <td className={tdNum}>{money(x.subtotalCents)}</td>
                <td className={tdNum}>{money(x.discountCents)}</td>
                <td className={tdNum}>{money(x.taxCents)}</td>
                <td className={cn(tdNum, "font-semibold")}>{money(x.totalCents)}</td>
                <td className={tdNum}>{money(x.cash)}</td>
                <td className={tdNum}>{money(x.card)}</td>
                <td className={tdNum}>{money(x.online)}</td>
                <td className={tdNum}>{money(x.account)}</td>
                <td className={tdNum}>{money(x.avgCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className={td}>{t("col.sum")}</td>
              <td className={tdNum}>{n(d.total.orders)}</td>
              <td className={tdNum}>{money(d.total.subtotalCents)}</td>
              <td className={tdNum}>{money(d.total.discountCents)}</td>
              <td className={tdNum}>{money(d.total.taxCents)}</td>
              <td className={tdNum}>{money(d.total.totalCents)}</td>
              <td className={tdNum}>{money(d.total.cash)}</td>
              <td className={tdNum}>{money(d.total.card)}</td>
              <td className={tdNum}>{money(d.total.online)}</td>
              <td className={tdNum}>{money(d.total.account)}</td>
              <td className={tdNum}>
                {money(d.total.orders ? Math.round(d.total.totalCents / d.total.orders) : 0)}
              </td>
            </tr>
          </tfoot>
        </Table>
        {hour ? <p className="text-xs text-fg-muted">{t("businessDayNote", { h: n(hour) })}</p> : null}
      </div>
    );
  }

  if (tab === "charts") {
    const [week, plans] = await Promise.all([weekdaySales(db, ctx, range), salesPlans(db, ctx, range)]);
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 lg:col-span-2">
          <p className="mb-3 font-semibold">{tr("dailySales")}</p>
          <DailyChart rows={sales.daily} money={money} day={day} />
        </Card>
        <Card className="p-4">
          <p className="mb-3 font-semibold">{t("weekday")}</p>
          <Bars
            rows={week.map((w) => ({ label: weekday(w.weekday), value: w.avgCents, hint: n(w.orders) }))}
            format={money}
          />
        </Card>
        <Card className="p-4">
          <p className="mb-3 font-semibold">{tr("byHour")}</p>
          <HourChart rows={sales.hourly} />
        </Card>
        <Card className="p-4">
          <p className="mb-3 font-semibold">{t("tabs.plans")}</p>
          <Bars
            rows={plans.rows.map((p) => ({
              label: t(`plan.${p.plan}`),
              value: p.totalCents,
              hint: n(p.orders),
            }))}
            format={money}
          />
        </Card>
        <Card className="p-4">
          <p className="mb-3 font-semibold">{tr("byCategory")}</p>
          <Bars
            rows={sales.categories
              .slice(0, 10)
              .map((c) => ({ label: c.name, value: c.revenueCents, hint: n(c.quantity) }))}
            format={money}
          />
        </Card>
        <Card className="p-4 lg:col-span-2">
          <p className="mb-3 font-semibold">{tr("paymentMethods")}</p>
          <Bars
            rows={sales.methods.map((m) => ({
              label: tr.has(`providers.${m.provider}`) ? tr(`providers.${m.provider}`) : m.provider,
              value: m.amountCents,
              hint: n(m.count),
            }))}
            format={money}
          />
        </Card>
      </div>
    );
  }

  if (tab === "plans") {
    const p = await salesPlans(db, ctx, range);
    if (!p.rows.length) return <Empty text={tr("noData")} />;
    return (
      <Table>
        <thead>
          <tr>
            <th className={th}>{t("col.plan")}</th>
            <th className={thEnd}>{tr("orders")}</th>
            <th className={thEnd}>{t("col.items")}</th>
            <th className={thEnd}>{tr("discounts")}</th>
            <th className={thEnd}>{t("col.total")}</th>
            <th className={thEnd}>{t("col.avg")}</th>
            <th className={thEnd}>{t("col.share")}</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((x) => (
            <tr key={x.plan}>
              <td className={cn(td, "font-semibold")}>{t(`plan.${x.plan}`)}</td>
              <td className={tdNum}>{n(x.orders)}</td>
              <td className={tdNum}>{n(x.items)}</td>
              <td className={tdNum}>{money(x.discountCents)}</td>
              <td className={cn(tdNum, "font-semibold")}>{money(x.totalCents)}</td>
              <td className={tdNum}>{money(x.avgCents)}</td>
              <td className={tdNum}>{pct(x.share)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className={td}>{t("col.sum")}</td>
            <td className={tdNum}>{n(p.rows.reduce((s, x) => s + x.orders, 0))}</td>
            <td className={tdNum}>{n(p.rows.reduce((s, x) => s + x.items, 0))}</td>
            <td className={tdNum}>{money(p.rows.reduce((s, x) => s + x.discountCents, 0))}</td>
            <td className={tdNum}>{money(p.total)}</td>
            <td />
            <td className={tdNum}>{pct(1)}</td>
          </tr>
        </tfoot>
      </Table>
    );
  }

  if (tab === "staff") {
    const s = await salesPerPerson(db, ctx, range);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi label={tr("revenue")} value={money(s.total)} />
          <Kpi label={t("covers")} value={n(s.covers)} />
          <Kpi label={t("perCover")} value={money(s.perCoverCents)} />
        </div>
        <Table min={900}>
          <thead>
            <tr>
              <th className={th}>{t("col.person")}</th>
              <th className={thEnd}>{tr("orders")}</th>
              <th className={thEnd}>{t("col.total")}</th>
              <th className={thEnd}>{t("col.avg")}</th>
              <th className={thEnd}>{tr("discounts")}</th>
              <th className={thEnd}>{tr("cancelled")}</th>
              <th className={thEnd}>{t("method.cash")}</th>
              <th className={thEnd}>{t("method.card")}</th>
              <th className={thEnd}>{t("method.account")}</th>
            </tr>
          </thead>
          <tbody>
            {s.people.map((p) => (
              <tr key={p.id}>
                <td className={cn(td, "font-semibold")}>
                  {p.id === "guests" ? t("guestsSelf") : (p.name ?? "—")}
                </td>
                <td className={tdNum}>{n(p.orders)}</td>
                <td className={cn(tdNum, "font-semibold")}>{money(p.totalCents)}</td>
                <td className={tdNum}>{money(p.avgCents)}</td>
                <td className={tdNum}>{money(p.discountCents)}</td>
                <td className={cn(tdNum, p.cancelled && "text-danger")}>{n(p.cancelled)}</td>
                <td className={tdNum}>{money(p.cash)}</td>
                <td className={tdNum}>{money(p.card)}</td>
                <td className={tdNum}>{money(p.account)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    );
  }

  if (tab === "invoices") {
    const inv = await invoicesInPeriod(db, ctx, range);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={t("invoiceCount")} value={n(inv.totals.count)} />
          <Kpi label={t("col.total")} value={money(inv.totals.totalCents)} />
          <Kpi label={tr("vat")} value={money(inv.totals.taxCents)} />
          <Kpi label={t("named")} value={n(inv.totals.named)} />
        </div>
        {inv.rows.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>{t("col.number")}</th>
                <th className={th}>{t("col.date")}</th>
                <th className={th}>{t("col.buyer")}</th>
                <th className={thEnd}>{tr("vat")}</th>
                <th className={thEnd}>{t("col.total")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {inv.rows.map((x) => (
                <tr key={x.id}>
                  <td className={cn(td, "font-semibold")} dir="ltr">
                    <span className="block text-start">{x.number}</span>
                  </td>
                  <td className={td}>{when(x.issuedAt)}</td>
                  <td className={td}>{x.buyer ?? "—"}</td>
                  <td className={tdNum}>{money(x.taxCents)}</td>
                  <td className={cn(tdNum, "font-semibold")}>{money(x.totalCents)}</td>
                  <td className={cn(td, "text-end")}>
                    <Link href={`/invoice/${x.token}`} className="font-semibold text-accent-text">
                      {t("open")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty text={t("noInvoices")} />
        )}
      </div>
    );
  }

  if (tab === "accounts") {
    const a = await creditAccounts(db, ctx, range);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={t("col.limit")} value={money(a.totals.limit)} />
          <Kpi
            label={t("col.balance")}
            value={money(a.totals.balance)}
            tone={a.totals.balance > 0 ? "bad" : undefined}
          />
          <Kpi label={t("col.charges")} value={money(a.totals.charges)} />
          <Kpi label={t("col.payments")} value={money(a.totals.payments)} tone="good" />
        </div>
        {a.rows.length ? (
          <Table min={900}>
            <thead>
              <tr>
                <th className={th}>{t("col.customer")}</th>
                <th className={thEnd}>{t("col.limit")}</th>
                <th className={thEnd}>{t("col.balance")}</th>
                <th className={thEnd}>{t("col.available")}</th>
                <th className={thEnd}>{t("col.charges")}</th>
                <th className={thEnd}>{t("col.payments")}</th>
                <th className={th}>{t("col.last")}</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map((c) => (
                <tr key={c.id}>
                  <td className={cn(td, "font-semibold")}>
                    <Link
                      href={`${base}?tab=statement&customer=${c.id}&${periodQs}`}
                      className="hover:underline"
                    >
                      {c.name ?? c.phone}
                    </Link>
                    {c.isBusiness ? (
                      <span className="ms-2 rounded-full bg-accent-soft px-1.5 text-[10px] font-bold text-accent-text">
                        B2B
                      </span>
                    ) : null}
                  </td>
                  <td className={tdNum}>{c.creditLimitCents != null ? money(c.creditLimitCents) : "—"}</td>
                  <td className={cn(tdNum, "font-semibold", c.balanceCents > 0 && "text-danger")}>
                    {money(c.balanceCents)}
                  </td>
                  <td
                    className={cn(tdNum, c.availableCents != null && c.availableCents < 0 && "text-danger")}
                  >
                    {c.availableCents != null ? money(c.availableCents) : "—"}
                  </td>
                  <td className={tdNum}>{money(c.chargesCents)}</td>
                  <td className={tdNum}>{money(c.paymentsCents)}</td>
                  <td className={td}>{when(c.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty text={t("noAccounts")} />
        )}
      </div>
    );
  }

  if (tab === "statement") {
    const list = (await creditAccounts(db, ctx, range)).rows;
    const chosen = customer && list.some((c) => c.id === customer) ? customer : list[0]?.id;
    if (!chosen) return <Empty text={t("noAccounts")} />;
    const s = await accountStatement(db, ctx, chosen, range);
    const qs = new URLSearchParams(periodQs);
    return (
      <div className="space-y-4">
        <form method="get" action={`/${locale}${base}`} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="statement" />
          {[...qs.entries()].map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label className="text-sm font-medium">
            {t("col.customer")}
            <select
              name="customer"
              defaultValue={chosen}
              className="mt-1 block h-11 min-w-64 rounded-xl border border-border-strong bg-surface px-3"
            >
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.phone}
                </option>
              ))}
            </select>
          </label>
          <button className="h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-ink-fg">
            {t("show")}
          </button>
        </form>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={t("opening")} value={money(s.openingCents)} />
          <Kpi label={t("col.charges")} value={money(s.chargesCents)} />
          <Kpi label={t("col.payments")} value={money(s.paymentsCents)} tone="good" />
          <Kpi
            label={t("closing")}
            value={money(s.closingCents)}
            tone={s.closingCents > 0 ? "bad" : undefined}
          />
        </div>
        <Table min={800}>
          <thead>
            <tr>
              <th className={th}>{t("col.date")}</th>
              <th className={th}>{t("col.operation")}</th>
              <th className={thEnd}>{t("col.debit")}</th>
              <th className={thEnd}>{t("col.credit")}</th>
              <th className={thEnd}>{t("col.balance")}</th>
              <th className={th}>{t("col.by")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-surface-2/40">
              <td className={td} colSpan={4}>
                {t("opening")}
              </td>
              <td className={tdNum}>{money(s.openingCents)}</td>
              <td />
            </tr>
            {s.lines.map((l) => (
              <tr key={l.id}>
                <td className={td}>{when(l.at)}</td>
                <td className={td}>
                  {t(`entry.${l.kind}`)}
                  {l.orderNumber ? (
                    <span className="ms-1.5 text-fg-muted" dir="ltr">
                      {l.orderNumber}
                    </span>
                  ) : null}
                  {l.method ? (
                    <span className="ms-1.5 text-xs text-fg-muted">
                      ({t.has(`method.${l.method}`) ? t(`method.${l.method}`) : l.method})
                    </span>
                  ) : null}
                  {l.note ? <span className="ms-1.5 text-xs text-fg-subtle">{l.note}</span> : null}
                </td>
                <td className={tdNum}>{l.amountCents > 0 ? money(l.amountCents) : ""}</td>
                <td className={tdNum}>{l.amountCents < 0 ? money(-l.amountCents) : ""}</td>
                <td className={cn(tdNum, "font-semibold")}>{money(l.balanceCents)}</td>
                <td className={cn(td, "text-xs text-fg-muted")}>{l.by ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className={td} colSpan={2}>
                {t("closing")}
              </td>
              <td className={tdNum}>{money(s.chargesCents)}</td>
              <td className={tdNum}>{money(s.paymentsCents)}</td>
              <td className={tdNum}>{money(s.closingCents)}</td>
              <td />
            </tr>
          </tfoot>
        </Table>
      </div>
    );
  }

  if (tab === "openBills") {
    const o = await openBills(db, ctx);
    const now = nowMs();
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi
            label={t("openTables")}
            value={n(o.tables.length)}
            hint={t("tablesDue", { n: o.totals.tables })}
          />
          <Kpi label={t("unpaidOrders")} value={n(o.orders.length)} />
          <Kpi
            label={t("due")}
            value={money(o.totals.dueCents)}
            tone={o.totals.dueCents ? "bad" : undefined}
          />
        </div>
        {o.tables.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>{t("col.table")}</th>
                <th className={th}>{t("col.opened")}</th>
                <th className={thEnd}>{t("col.duration")}</th>
                <th className={thEnd}>{t("col.guests")}</th>
                <th className={thEnd}>{tr("orders")}</th>
                <th className={thEnd}>{t("due")}</th>
              </tr>
            </thead>
            <tbody>
              {o.tables.map((x) => (
                <tr key={x.id}>
                  <td className={cn(td, "font-semibold")}>{x.label}</td>
                  <td className={td}>{when(x.openedAt)}</td>
                  <td className={tdNum}>{minutes(Math.round((now - x.openedAt.getTime()) / 60_000))}</td>
                  <td className={tdNum}>{n(x.guests)}</td>
                  <td className={tdNum}>{n(x.orders)}</td>
                  <td className={cn(tdNum, "font-semibold", x.dueCents && "text-danger")}>
                    {money(x.dueCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        <OrdersTable
          rows={o.orders}
          title={t("unpaidOrders")}
          t={t}
          when={when}
          money={money}
          empty={t("noOpenBills")}
        />
      </div>
    );
  }

  if (tab === "debtors") {
    const d = await debtors(db, ctx);
    const now = nowMs();
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Kpi
            label={t("accountDebts")}
            value={money(d.totals.accounts)}
            hint={t("customersN", { n: d.accounts.length })}
          />
          <Kpi
            label={t("oldUnpaid")}
            value={money(d.totals.orders)}
            hint={tr("ordersN", { count: d.orders.length })}
          />
        </div>
        {d.accounts.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>{t("col.customer")}</th>
                <th className={thEnd}>{t("col.balance")}</th>
                <th className={thEnd}>{t("col.limit")}</th>
                <th className={thEnd}>{t("col.age")}</th>
              </tr>
            </thead>
            <tbody>
              {d.accounts.map((c) => {
                const age = c.oldest ? Math.floor((now - new Date(c.oldest).getTime()) / 86_400_000) : 0;
                return (
                  <tr key={c.id}>
                    <td className={cn(td, "font-semibold")}>
                      <Link
                        href={`${base}?tab=statement&customer=${c.id}&${periodQs}`}
                        className="hover:underline"
                      >
                        {c.name ?? c.phone}
                      </Link>
                    </td>
                    <td className={cn(tdNum, "font-semibold text-danger")}>{money(c.balanceCents)}</td>
                    <td className={tdNum}>{c.creditLimitCents != null ? money(c.creditLimitCents) : "—"}</td>
                    <td className={cn(tdNum, age > c.paymentTermsDays && "font-semibold text-danger")}>
                      {t("days", { n: age })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : null}
        <OrdersTable
          rows={d.orders}
          title={t("oldUnpaid")}
          t={t}
          when={when}
          money={money}
          empty={d.accounts.length ? "" : t("noDebtors")}
        />
      </div>
    );
  }

  if (tab === "onAccount") {
    const c = await chargesOnAccount(db, ctx, range);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Kpi
            label={t("accountCharges")}
            value={money(c.totals.charges)}
            hint={t("chargesN", { n: c.charges.length })}
          />
          {ctx.restaurant.kind === "hotel" || c.rooms.length ? (
            <Kpi
              label={t("roomCharges")}
              value={money(c.totals.rooms)}
              hint={tr("ordersN", { count: c.rooms.length })}
            />
          ) : null}
        </div>
        {c.byCustomer.length ? (
          <Card className="p-4">
            <p className="mb-3 font-semibold">{t("byCustomer")}</p>
            <Bars
              rows={c.byCustomer.map((x) => ({ label: x.name, value: x.amountCents, hint: n(x.count) }))}
              format={money}
            />
          </Card>
        ) : null}
        {c.charges.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>{t("col.date")}</th>
                <th className={th}>{t("col.customer")}</th>
                <th className={th}>{t("col.number")}</th>
                <th className={thEnd}>{t("col.total")}</th>
              </tr>
            </thead>
            <tbody>
              {c.charges.map((x) => (
                <tr key={x.id}>
                  <td className={td}>{when(x.at)}</td>
                  <td className={cn(td, "font-medium")}>{x.name ?? x.phone}</td>
                  <td className={td} dir="ltr">
                    <span className="block text-start">{x.orderNumber ?? "—"}</span>
                  </td>
                  <td className={cn(tdNum, "font-semibold")}>{money(x.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        {c.rooms.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>{t("col.date")}</th>
                <th className={th}>{t("col.room")}</th>
                <th className={th}>{t("col.number")}</th>
                <th className={th}>{t("col.state")}</th>
                <th className={thEnd}>{t("col.total")}</th>
              </tr>
            </thead>
            <tbody>
              {c.rooms.map((x) => (
                <tr key={x.id}>
                  <td className={td}>{when(x.at)}</td>
                  <td className={cn(td, "font-medium")}>{x.room ?? "—"}</td>
                  <td className={td} dir="ltr">
                    <span className="block text-start">{x.number}</span>
                  </td>
                  <td className={td}>{x.paymentStatus === "paid" ? t("paid") : t("unpaid")}</td>
                  <td className={cn(tdNum, "font-semibold")}>{money(x.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        {!c.charges.length && !c.rooms.length ? <Empty text={t("noCharges")} /> : null}
      </div>
    );
  }

  if (tab === "upcoming") {
    const u = await upcomingGuests(db, ctx);
    const byDay = new Map<string, typeof u.list>();
    for (const b of u.list) {
      const k = format.dateTime(b.startsAt, { dateStyle: "full", timeZone: tz });
      byDay.set(k, [...(byDay.get(k) ?? []), b]);
    }
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Kpi label={t("bookings")} value={n(u.totals.bookings)} hint={t("next14")} />
          <Kpi label={t("covers")} value={n(u.totals.covers)} />
        </div>
        {u.list.length ? (
          [...byDay.entries()].map(([k, list]) => (
            <section key={k}>
              <h3 className="mb-2 flex items-baseline justify-between text-sm font-bold">
                <span>{k}</span>
                <span className="text-fg-muted">
                  {t("coversN", { n: list.reduce((s, b) => s + b.partySize, 0) })}
                </span>
              </h3>
              <Table>
                <tbody>
                  {list.map((b) => (
                    <tr key={b.id}>
                      <td className={cn(td, "w-20 font-bold tabular-nums")}>
                        {format.dateTime(b.startsAt, { hour: "2-digit", minute: "2-digit", timeZone: tz })}
                      </td>
                      <td className={cn(td, "font-semibold")}>
                        {b.name}
                        {b.occasion ? (
                          <span className="ms-2 text-xs text-accent-text">
                            {t.has(`occasion.${b.occasion}`) ? t(`occasion.${b.occasion}`) : b.occasion}
                          </span>
                        ) : null}
                      </td>
                      <td className={td} dir="ltr">
                        {b.phone}
                      </td>
                      <td className={tdNum}>{t("coversN", { n: b.partySize })}</td>
                      <td className={td}>{b.table ?? "—"}</td>
                      <td className={cn(td, "text-xs text-fg-muted")}>{b.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>
          ))
        ) : (
          <Empty text={t("noUpcoming")} />
        )}
      </div>
    );
  }

  if (tab === "walkins") {
    const w = await walkIns(db, ctx, range);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={t("visits")} value={n(w.visits)} />
          <Kpi label={t("walkIns")} value={n(w.walkIns)} hint={pct(w.share)} />
          <Kpi label={t("booked")} value={n(w.booked)} />
          <Kpi
            label={t("walkInCovers")}
            value={n(w.walkInCovers)}
            hint={t("bookedCovers", { n: w.bookedCovers })}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <p className="mb-3 font-semibold">{t("walkInsByHour")}</p>
            <Bars
              rows={w.hours.map((h) => ({ label: hourLabel(h.hour), value: h.walkIn, hint: n(h.booked) }))}
              format={n}
            />
            <p className="mt-2 text-xs text-fg-subtle">{t("bookedHint")}</p>
          </Card>
          <Card className="p-4">
            <p className="mb-3 font-semibold">{t("walkInsByWeekday")}</p>
            <Bars
              rows={w.weekdays.map((d) => ({
                label: weekday(d.weekday),
                value: d.walkIn,
                hint: n(d.booked),
              }))}
              format={n}
            />
          </Card>
        </div>
        <p className="text-xs text-fg-muted">{t("walkInsNote")}</p>
      </div>
    );
  }

  if (tab === "occupancy") {
    const o = await occupancy(db, ctx, range, hour);
    if (!o.tables) return <Empty text={t("noTables")} />;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label={t("tables")}
            value={n(o.tables)}
            hint={o.seats ? t("seatsN", { n: o.seats }) : undefined}
          />
          <Kpi label={t("visits")} value={n(o.visits)} hint={t("coversN", { n: o.covers })} />
          <Kpi label={t("turnover")} value={n(Math.round(o.turnover * 10) / 10)} hint={t("perTablePerDay")} />
          <Kpi label={t("avgStay")} value={minutes(o.avgMinutes)} />
        </div>
        <Card className="p-4">
          <p className="mb-3 font-semibold">{t("occupancyByHour")}</p>
          <ul className="space-y-1.5">
            {o.hours.map((h) => (
              <li key={h.hour} className="flex items-center gap-3 text-sm">
                <span className="w-12 shrink-0 text-fg-muted tabular-nums">{hourLabel(h.hour)}</span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      h.pct > 0.8 ? "bg-danger" : h.pct > 0.5 ? "bg-warning" : "bg-accent",
                    )}
                    style={{ width: `${Math.max(2, h.pct * 100)}%` }}
                  />
                </span>
                <span className="w-14 shrink-0 text-end font-semibold tabular-nums">{pct(h.pct)}</span>
              </li>
            ))}
          </ul>
        </Card>
        {o.days.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>{t("col.day")}</th>
                <th className={thEnd}>{t("visits")}</th>
                <th className={thEnd}>{t("covers")}</th>
                <th className={thEnd}>{t("turnover")}</th>
                <th className={thEnd}>{t("avgStay")}</th>
              </tr>
            </thead>
            <tbody>
              {o.days.map((d) => (
                <tr key={d.day}>
                  <td className={cn(td, "font-medium")}>{day(d.day)}</td>
                  <td className={tdNum}>{n(d.visits)}</td>
                  <td className={tdNum}>{n(d.covers)}</td>
                  <td className={tdNum}>{n(Math.round(d.turnover * 10) / 10)}</td>
                  <td className={tdNum}>{minutes(d.avgMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </div>
    );
  }

  if (tab === "bank") {
    const b = await bankReport(db, ctx, range, hour);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={t("toBank")} value={money(b.bankCents)} tone="good" />
          <Kpi label={t("method.card")} value={money(b.methods.card)} />
          <Kpi label={t("method.online")} value={money(b.methods.online)} />
          <Kpi label={t("refunds")} value={money(b.refunds)} tone={b.refunds ? "bad" : undefined} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="border-b border-border px-4 py-3 font-semibold">{t("bankSummary")}</p>
            <dl className="divide-y divide-border text-sm">
              <Row k={t("method.card")} v={money(b.methods.card)} />
              <Row k={t("method.online")} v={money(b.methods.online)} />
              <Row k={t("repaidCard")} v={money(b.repaid.card)} />
              <Row k={t("repaidTransfer")} v={money(b.repaid.transfer)} />
              <Row k={t("refunds")} v={`−${money(b.refunds)}`} muted />
              <Row k={t("toBank")} v={money(b.bankCents)} bold />
              <Row k={t("method.cash")} v={money(b.methods.cash + b.repaid.cash)} muted hint={t("notBank")} />
              <Row k={t("repaidCheque")} v={money(b.repaid.cheque)} muted />
            </dl>
          </Card>
          <Card className="p-4">
            <p className="mb-3 font-semibold">{t("bankByDay")}</p>
            <DailyChart
              rows={b.days.map((d) => ({ day: d.day, orders: 0, totalCents: d.card + d.online + d.other }))}
              money={money}
              day={day}
            />
          </Card>
        </div>
        {b.recent.length ? (
          <Table min={800}>
            <thead>
              <tr>
                <th className={th}>{t("col.date")}</th>
                <th className={th}>{t("col.method")}</th>
                <th className={th}>{t("col.reference")}</th>
                <th className={th}>{t("col.by")}</th>
                <th className={thEnd}>{t("col.total")}</th>
              </tr>
            </thead>
            <tbody>
              {b.recent.map((x) => (
                <tr key={x.id}>
                  <td className={td}>{when(x.at)}</td>
                  <td className={td}>
                    {tr.has(`providers.${x.provider}`) ? tr(`providers.${x.provider}`) : x.provider}
                  </td>
                  <td className={cn(td, "font-mono text-xs")} dir="ltr">
                    <span className="block text-start">{x.terminalRef ?? x.providerRef ?? "—"}</span>
                  </td>
                  <td className={cn(td, "text-xs text-fg-muted")}>{x.by ?? "—"}</td>
                  <td className={cn(tdNum, "font-semibold")}>
                    {money(x.amountCents)}
                    {x.refundedCents ? (
                      <span className="ms-1 text-xs text-danger">−{money(x.refundedCents)}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty text={t("noBank")} />
        )}
      </div>
    );
  }

  // tab === "full": everything on one printable page.
  const [d, plans, staff, accounts, bills, bank] = await Promise.all([
    dailySales(db, ctx, range, hour),
    salesPlans(db, ctx, range),
    salesPerPerson(db, ctx, range),
    creditAccounts(db, ctx, range),
    openBills(db, ctx),
    bankReport(db, ctx, range, hour),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PrintButton label={t("print")} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={tr("revenue")}
          value={money(pnl.revenueCents)}
          hint={tr("ordersN", { count: d.total.orders })}
        />
        <Kpi label={tr("avgTicket")} value={money(sales.summary.avgTicketCents)} />
        <Kpi label={tr("grossMargin")} value={money(pnl.grossCents)} />
        <Kpi label={tr("netProfit")} value={money(pnl.netCents)} tone={pnl.netCents >= 0 ? "good" : "bad"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="border-b border-border px-4 py-3 font-semibold">{tr("pnl")}</p>
          <dl className="divide-y divide-border text-sm">
            <Row k={tr("revenue")} v={money(pnl.revenueCents)} />
            <Row k={tr("vat")} v={`−${money(pnl.taxCents)}`} muted />
            <Row k={tr("netSales")} v={money(pnl.netSalesCents)} bold />
            <Row k={tr("cogs")} v={`−${money(pnl.cogsCents)}`} muted />
            <Row k={tr("grossMargin")} v={money(pnl.grossCents)} bold />
            <Row k={tr("totalExpenses")} v={`−${money(pnl.expensesCents)}`} muted />
            <Row k={tr("netProfit")} v={money(pnl.netCents)} bold tone={pnl.netCents >= 0 ? "good" : "bad"} />
          </dl>
        </Card>
        <Card>
          <p className="border-b border-border px-4 py-3 font-semibold">{t("collected")}</p>
          <dl className="divide-y divide-border text-sm">
            <Row k={t("method.cash")} v={money(d.total.cash)} />
            <Row k={t("method.card")} v={money(d.total.card)} />
            <Row k={t("method.online")} v={money(d.total.online)} />
            <Row k={t("method.account")} v={money(d.total.account)} />
            <Row k={t("toBank")} v={money(bank.bankCents)} bold />
            <Row k={t("col.balance")} v={money(accounts.totals.balance)} muted hint={t("tabs.accounts")} />
            <Row k={t("due")} v={money(bills.totals.dueCents)} muted hint={t("tabs.openBills")} />
          </dl>
        </Card>
        <Card className="p-4">
          <p className="mb-3 font-semibold">{t("tabs.plans")}</p>
          <Bars
            rows={plans.rows.map((p) => ({
              label: t(`plan.${p.plan}`),
              value: p.totalCents,
              hint: n(p.orders),
            }))}
            format={money}
          />
        </Card>
        <Card className="p-4">
          <p className="mb-3 font-semibold">{t("tabs.staff")}</p>
          <Bars
            rows={staff.people.slice(0, 8).map((p) => ({
              label: p.id === "guests" ? t("guestsSelf") : (p.name ?? "—"),
              value: p.totalCents,
              hint: n(p.orders),
            }))}
            format={money}
          />
        </Card>
        <Card className="p-4 lg:col-span-2">
          <p className="mb-3 font-semibold">{t("topProducts")}</p>
          <Bars
            rows={sales.products
              .slice(0, 10)
              .map((p) => ({ label: p.name, value: p.revenueCents, hint: n(p.quantity) }))}
            format={money}
          />
        </Card>
      </div>
      <Table min={700}>
        <thead>
          <tr>
            <th className={th}>{t("col.day")}</th>
            <th className={thEnd}>{tr("orders")}</th>
            <th className={thEnd}>{t("col.total")}</th>
            <th className={thEnd}>{t("method.cash")}</th>
            <th className={thEnd}>{t("method.card")}</th>
            <th className={thEnd}>{t("method.online")}</th>
          </tr>
        </thead>
        <tbody>
          {d.days.map((x) => (
            <tr key={x.day}>
              <td className={td}>{day(x.day)}</td>
              <td className={tdNum}>{n(x.orders)}</td>
              <td className={cn(tdNum, "font-semibold")}>{money(x.totalCents)}</td>
              <td className={tdNum}>{money(x.cash)}</td>
              <td className={tdNum}>{money(x.card)}</td>
              <td className={tdNum}>{money(x.online)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function OrdersTable({
  rows,
  title,
  t,
  when,
  money,
  empty,
}: {
  rows: {
    id: string;
    number: string;
    placedAt: Date;
    channel: string;
    tableLabel: string | null;
    totalCents: number;
    customerName: string | null;
    customerPhone: string | null;
    isB2b: boolean;
  }[];
  title: string;
  t: Awaited<ReturnType<typeof getTranslations<"reports.center">>>;
  when: (d: Date | null) => string;
  money: (c: number) => string;
  empty: string;
}) {
  if (!rows.length) return empty ? <Empty text={empty} /> : null;
  return (
    <section>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <Table>
        <thead>
          <tr>
            <th className={th}>{t("col.number")}</th>
            <th className={th}>{t("col.date")}</th>
            <th className={th}>{t("col.where")}</th>
            <th className={th}>{t("col.customer")}</th>
            <th className={thEnd}>{t("due")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td className={cn(td, "font-semibold")} dir="ltr">
                <span className="block text-start">{o.number}</span>
              </td>
              <td className={td}>{when(o.placedAt)}</td>
              <td className={td}>{o.isB2b ? "B2B" : (o.tableLabel ?? t(`channel.${o.channel}`))}</td>
              <td className={td}>{o.customerName ?? o.customerPhone ?? "—"}</td>
              <td className={cn(tdNum, "font-semibold text-danger")}>{money(o.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}
