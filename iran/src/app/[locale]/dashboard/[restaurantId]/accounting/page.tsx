import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Banknote,
  BookOpenText,
  CalendarRange,
  ChartColumn,
  Download,
  Gauge,
  Landmark,
  Lock,
  Scale,
  TrendingDown,
  TrendingUp,
  UsersRound,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import {
  BudgetCell,
  LedgerAccountButton,
  LockForm,
  ManualEntryButton,
  ReconcileTable,
  ReverseButton,
  SyncButton,
  ChequeActions,
  PaySupplierButton,
} from "@/components/ledger/ledger-forms";
import { chequeRegister, payablesAging } from "@/server/modules/ledger/finance";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getMoney, getMoneyCompact } from "@/lib/money-server";
import { localDay } from "@/lib/period";
import { syncLedger } from "@/server/modules/ledger/sync";
import {
  budgetsFor,
  ledgerState,
  listEntries,
  listLedgerAccounts,
  unreconciled,
} from "@/server/modules/ledger/service";
import {
  agedReceivables,
  balanceSheet,
  cashSummary,
  generalLedger,
  incomeStatement,
  taxReport,
  trialBalance,
} from "@/server/modules/ledger/reports";
import { addDays, isDay } from "@/lib/days";
import { fiscalYearMonths, fiscalYearStart, monthRange, monthStart } from "@/server/modules/ledger/periods";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DateInput } from "@/components/ui/date-input";
import { calendarLocale } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";

const TABS = [
  "overview",
  "journal",
  "ledger",
  "trial",
  "income",
  "balance",
  "receivables",
  "cheques",
  "payables",
  "tax",
  "bank",
  "chart",
  "close",
] as const;
type Tab = (typeof TABS)[number];

/** The books in six rooms: each with its own pages, so no tab is ever hidden off-screen. */
const GROUPS: { key: string; Icon: typeof Gauge; tabs: Tab[] }[] = [
  { key: "steering", Icon: Gauge, tabs: ["overview"] },
  { key: "entries", Icon: BookOpenText, tabs: ["journal", "ledger", "trial"] },
  { key: "statements", Icon: ChartColumn, tabs: ["income", "balance"] },
  { key: "parties", Icon: UsersRound, tabs: ["receivables", "payables", "cheques"] },
  { key: "treasury", Icon: Wallet, tabs: ["bank"] },
  { key: "closing", Icon: Lock, tabs: ["tax", "chart", "close"] },
];
type Props = PageProps<"/[locale]/dashboard/[restaurantId]/accounting">;

export default function LedgerPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <Ledger params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Cheque status chips: the venue's colour while in progress, green or red once settled. */
const CHEQUE_TONE: Record<string, string> = {
  in_hand: "bg-accent-soft text-accent-text",
  issued: "bg-accent-soft text-accent-text",
  deposited: "bg-accent-soft text-accent-text",
  cleared: "bg-success-soft text-success",
  bounced: "bg-danger-soft text-danger",
  returned: "bg-surface-3 text-fg-muted",
  cancelled: "bg-surface-3 text-fg-muted",
};

const th = "px-3 py-2.5 text-start text-xs font-semibold text-fg-muted";
const thEnd = "px-3 py-2.5 text-end text-xs font-semibold text-fg-muted";
const td = "px-3 py-2";
const tdNum = "px-3 py-2 text-end tabular-nums";

function Table({ children, min = 640 }: { children: React.ReactNode; min?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-[var(--shadow-soft)]">
      <table
        className={cn(
          "w-full text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-border",
          // Header in a pale shade of the venue's colour, rows lit on hover, figures aligned.
          "[&_thead]:bg-accent-soft/50 [&_thead_th]:font-semibold [&_thead_th]:text-accent-text",
          "[&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-accent-soft/30",
          "[&_tfoot]:border-t-2 [&_tfoot]:border-accent/25 [&_tfoot]:bg-accent-soft/40 [&_tfoot]:font-bold",
        )}
        style={{ minWidth: min }}
      >
        {children}
      </table>
    </div>
  );
}

/** General ledger, financial statements and closing — the venue's books. */
async function Ledger({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "accounting.manage", "accounting");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const today = localDay(new Date(), tz);
  const from = typeof sp.from === "string" && isDay(sp.from) ? sp.from : monthStart(today);
  const to = typeof sp.to === "string" && isDay(sp.to) ? sp.to : today;
  const tab: Tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : "overview";
  // The books are brought up to date before any report is read.
  await syncLedger(db, ctx.restaurant);
  const locale = await getLocale();
  const [t, money, big, accounts, state] = await Promise.all([
    getTranslations("ledger"),
    getMoney(ctx.restaurant.currency),
    getMoneyCompact(ctx.restaurant.currency),
    listLedgerAccounts(db, rid),
    ledgerState(db, rid),
  ]);
  const tType = await getTranslations("ledger.type");
  const day = (d: string) =>
    new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));
  const monthName = (key: string, opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) =>
    new Intl.DateTimeFormat(calendarLocale(locale, EDITION), { ...opts, timeZone: "UTC" }).format(
      new Date(`${monthRange(key).first}T12:00:00Z`),
    );
  const base = `/dashboard/${rid}/accounting`;
  const q = (extra: Record<string, string>) => `${base}?${new URLSearchParams({ tab, from, to, ...extra })}`;
  const signed = (n: number) => <span className={n < 0 ? "text-danger" : undefined}>{money(n)}</span>;

  let body: React.ReactNode = null;

  if (tab === "overview") {
    const [pl, cash, aged] = await Promise.all([
      incomeStatement(db, ctx, from, to),
      cashSummary(db, ctx, from, to),
      agedReceivables(db, ctx, to),
    ]);
    body = (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label={t("revenue")}
            value={<span title={money(pl.totals.revenue)}>{big(pl.totals.revenue)}</span>}
            hint={t("vsPrevious", { amount: money(pl.totals.previousRevenue) })}
            icon={<TrendingUp />}
            tone="ink"
          />
          <StatCard
            label={t("expenses")}
            value={<span title={money(pl.totals.expense)}>{big(pl.totals.expense)}</span>}
            icon={<TrendingDown />}
            tone="rose"
          />
          <StatCard
            label={t("netResult")}
            value={<span title={money(pl.totals.net)}>{big(pl.totals.net)}</span>}
            icon={<Scale />}
            tone={pl.totals.net >= 0 ? "emerald" : "rose"}
          />
          <StatCard
            label={t("cash")}
            value={
              <span title={money(cash.reduce((s, c) => s + c.closing, 0))}>
                {big(cash.reduce((s, c) => s + c.closing, 0))}
              </span>
            }
            hint={t("receivables", { amount: money(aged.totals.receivables) })}
            icon={<Landmark />}
            tone="indigo"
          />
        </div>
        {/* At a glance: what each sales channel brings and costs. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t("mixTitle")} description={t("mixHint")} />
            <ul className="space-y-3.5 p-5">
              {(() => {
                const depts = pl.departments.filter((d) => d.revenue > 0 || d.expense > 0);
                const max = Math.max(1, ...depts.map((d) => Math.max(d.revenue, d.expense)));
                return depts.map((d) => (
                  <li key={d.department}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-semibold">
                        {t.has(`dept.${d.department}`) ? t(`dept.${d.department}`) : d.department}
                      </span>
                      <span className="text-xs text-fg-muted tabular-nums" title={money(d.profit)}>
                        {big(d.revenue)}
                        {d.revenue ? ` | ${Math.round((d.profit / d.revenue) * 100)}%` : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <div className="h-2 overflow-hidden rounded-full bg-accent-soft/50">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${(d.revenue / max) * 100}%` }}
                        />
                      </div>
                      {d.expense ? (
                        <div className="h-1.5 overflow-hidden rounded-full bg-accent-soft/50">
                          <div
                            className="h-full rounded-full bg-accent/40"
                            style={{ width: `${(d.expense / max) * 100}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </li>
                ));
              })()}
            </ul>
            <div className="flex gap-4 border-t border-border px-5 py-3 text-xs text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-accent" aria-hidden="true" />
                {t("revenue")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-accent/40" aria-hidden="true" />
                {t("expenses")}
              </span>
            </div>
          </Card>
          <Card>
            <CardHeader title={t("cashTitle")} description={t("cashHint")} />
            <ul className="divide-y divide-border">
              {cash.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block text-xs text-fg-muted tabular-nums">
                      +{money(c.inflow)} · −{money(c.outflow)}
                    </span>
                  </span>
                  <span className="font-bold tabular-nums">{signed(c.closing)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <section>
          <h2 className="mb-2 font-semibold">{t("byDepartment")}</h2>
          <Table>
            <thead className="bg-surface-2">
              <tr>
                <th className={th}>{t("department")}</th>
                <th className={thEnd}>{t("revenue")}</th>
                <th className={thEnd}>{t("expenses")}</th>
                <th className={thEnd}>{t("profit")}</th>
                <th className={thEnd}>{t("margin")}</th>
              </tr>
            </thead>
            <tbody>
              {pl.departments.map((d) => (
                <tr key={d.department}>
                  <td className={cn(td, "font-semibold")}>
                    {t.has(`dept.${d.department}`) ? t(`dept.${d.department}`) : d.department}
                  </td>
                  <td className={tdNum}>{money(d.revenue)}</td>
                  <td className={tdNum}>{money(d.expense)}</td>
                  <td className={cn(tdNum, "font-semibold")}>{signed(d.profit)}</td>
                  <td className={tdNum}>
                    {d.revenue ? `${Math.round((d.profit / d.revenue) * 1000) / 10}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      </div>
    );
  } else if (tab === "journal") {
    const entries = await listEntries(db, ctx, { from, to });
    body = (
      <div className="space-y-4">
        <ManualEntryButton
          restaurantId={rid}
          currency={ctx.restaurant.currency}
          accounts={accounts}
          today={today}
        />
        <div className="space-y-3">
          {entries.map((e) => (
            <article key={e.id} className="rounded-2xl border border-border bg-surface">
              <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 text-sm">
                <span className="font-mono text-xs text-fg-muted">#{e.number}</span>
                <span className="font-semibold">{day(e.date)}</span>
                <span className="min-w-0 flex-1 truncate">{e.memo}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-fg-muted uppercase">
                  {t.has(`source.${e.sourceType}`) ? t(`source.${e.sourceType}`) : e.sourceType}
                </span>
                {e.sourceType === "manual" ? <ReverseButton restaurantId={rid} entryId={e.id} /> : null}
              </header>
              <table className="w-full text-sm">
                <tbody>
                  {e.lines.map((l, i) => (
                    <tr key={i}>
                      <td className={cn(td, l.creditCents ? "ps-10" : "")}>
                        <span className="font-mono text-xs text-fg-muted">{l.code}</span> {l.name}
                      </td>
                      <td className={cn(tdNum, "w-36")}>{l.debitCents ? money(l.debitCents) : ""}</td>
                      <td className={cn(tdNum, "w-36")}>{l.creditCents ? money(l.creditCents) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
          {!entries.length ? <p className="py-10 text-center text-fg-muted">{t("noEntries")}</p> : null}
        </div>
      </div>
    );
  } else if (tab === "ledger") {
    const accountId = typeof sp.account === "string" ? sp.account : accounts[0]?.id;
    const gl = accountId ? await generalLedger(db, ctx, accountId, from, to) : null;
    body = (
      <div className="space-y-4">
        <form className="flex flex-wrap gap-2">
          <input type="hidden" name="tab" value="ledger" />
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <select
            name="account"
            defaultValue={accountId}
            className="h-11 rounded-xl border border-border-strong bg-surface px-3"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
          <button className={buttonClasses("secondary", "lg")}>{t("show")}</button>
        </form>
        {gl ? (
          <Table>
            <thead className="bg-surface-2">
              <tr>
                <th className={th}>{t("date")}</th>
                <th className={th}>{t("entry")}</th>
                <th className={thEnd}>{t("debit")}</th>
                <th className={thEnd}>{t("credit")}</th>
                <th className={thEnd}>{t("runningBalance")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-surface-2/50 font-semibold">
                <td className={td} colSpan={4}>
                  {t("opening")}
                </td>
                <td className={tdNum}>{signed(gl.openingNet)}</td>
              </tr>
              {gl.lines.map((l) => (
                <tr key={l.id}>
                  <td className={cn(td, "whitespace-nowrap")}>{day(l.date)}</td>
                  <td className={td}>
                    <span className="font-mono text-xs text-fg-muted">#{l.number}</span>{" "}
                    {l.description ?? l.memo}
                  </td>
                  <td className={tdNum}>{l.debitCents ? money(l.debitCents) : ""}</td>
                  <td className={tdNum}>{l.creditCents ? money(l.creditCents) : ""}</td>
                  <td className={tdNum}>{signed(l.runningNet)}</td>
                </tr>
              ))}
              <tr className="bg-surface-2/50 font-semibold">
                <td className={td} colSpan={4}>
                  {t("closing")}
                </td>
                <td className={tdNum}>{signed(gl.closingNet)}</td>
              </tr>
            </tbody>
          </Table>
        ) : null}
      </div>
    );
  } else if (tab === "trial") {
    const tb = await trialBalance(db, ctx, from, to);
    body = (
      <Table min={760}>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>{t("account")}</th>
            <th className={thEnd}>{t("opening")}</th>
            <th className={thEnd}>{t("debit")}</th>
            <th className={thEnd}>{t("credit")}</th>
            <th className={thEnd}>{t("closingDebit")}</th>
            <th className={thEnd}>{t("closingCredit")}</th>
          </tr>
        </thead>
        <tbody>
          {tb.rows.map((r) => (
            <tr key={r.id}>
              <td className={td}>
                <Link
                  href={`${base}?tab=ledger&account=${r.id}&from=${from}&to=${to}`}
                  className="hover:underline"
                >
                  <span className="font-mono text-xs text-fg-muted">{r.code}</span> {r.name}
                </Link>
              </td>
              <td className={tdNum}>{signed(r.openingNet)}</td>
              <td className={tdNum}>{money(r.debit)}</td>
              <td className={tdNum}>{money(r.credit)}</td>
              <td className={tdNum}>{r.closingNet > 0 ? money(r.closingNet) : ""}</td>
              <td className={tdNum}>{r.closingNet < 0 ? money(-r.closingNet) : ""}</td>
            </tr>
          ))}
          <tr className="bg-surface-2 font-bold">
            <td className={td} colSpan={2}>
              {t("totals")} {tb.totals.debit === tb.totals.credit ? "✓" : "⚠"}
            </td>
            <td className={tdNum}>{money(tb.totals.debit)}</td>
            <td className={tdNum}>{money(tb.totals.credit)}</td>
            <td className={tdNum}>{money(tb.totals.closingDebit)}</td>
            <td className={tdNum}>{money(tb.totals.closingCredit)}</td>
          </tr>
        </tbody>
      </Table>
    );
  } else if (tab === "income") {
    const pl = await incomeStatement(db, ctx, from, to);
    const section = (title: string, rows: typeof pl.revenue, total: number, prev: number, budget: number) => (
      <>
        <tr className="bg-surface-2/60">
          <td className={cn(td, "font-bold")} colSpan={5}>
            {title}
          </td>
        </tr>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={cn(td, "ps-6")}>
              <span className="font-mono text-xs text-fg-muted">{r.code}</span> {r.name}
            </td>
            <td className={tdNum}>{money(r.amount)}</td>
            <td className={tdNum}>{r.budget != null ? money(r.budget) : "—"}</td>
            <td className={tdNum}>{r.budget ? `${Math.round((r.amount / r.budget) * 100)}%` : "—"}</td>
            <td className={cn(tdNum, "text-fg-muted")}>{money(r.previous)}</td>
          </tr>
        ))}
        <tr className="font-semibold">
          <td className={td}>{t("total")}</td>
          <td className={tdNum}>{money(total)}</td>
          <td className={tdNum}>{budget ? money(budget) : "—"}</td>
          <td className={tdNum}>{budget ? `${Math.round((total / budget) * 100)}%` : "—"}</td>
          <td className={cn(tdNum, "text-fg-muted")}>{money(prev)}</td>
        </tr>
      </>
    );
    body = (
      <Table min={720}>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>{t("account")}</th>
            <th className={thEnd}>{t("actual")}</th>
            <th className={thEnd}>{t("budget")}</th>
            <th className={thEnd}>{t("achieved")}</th>
            <th className={thEnd}>
              {t("previousPeriod", { from: day(pl.previousFrom), to: day(pl.previousTo) })}
            </th>
          </tr>
        </thead>
        <tbody>
          {section(
            t("revenue"),
            pl.revenue,
            pl.totals.revenue,
            pl.totals.previousRevenue,
            pl.totals.budgetRevenue,
          )}
          {section(
            t("expenses"),
            pl.expense,
            pl.totals.expense,
            pl.totals.previousExpense,
            pl.totals.budgetExpense,
          )}
          <tr className="bg-surface-2 text-base font-bold">
            <td className={td}>{t("netResult")}</td>
            <td className={tdNum}>{signed(pl.totals.net)}</td>
            <td className={tdNum}>{money(pl.totals.budgetRevenue - pl.totals.budgetExpense)}</td>
            <td className={tdNum} />
            <td className={cn(tdNum, "text-fg-muted")}>{money(pl.totals.previousNet)}</td>
          </tr>
        </tbody>
      </Table>
    );
  } else if (tab === "balance") {
    const bs = await balanceSheet(db, ctx, to);
    const col = (
      title: string,
      rows: { id: string; code: string; name: string; amount: number }[],
      extra?: React.ReactNode,
      total?: number,
    ) => (
      <section className="rounded-2xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 font-bold">{title}</h2>
        <ul className="divide-y divide-border text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex justify-between px-4 py-2">
              <span>
                <span className="font-mono text-xs text-fg-muted">{r.code}</span> {r.name}
              </span>
              <span className="tabular-nums">{signed(r.amount)}</span>
            </li>
          ))}
          {extra}
        </ul>
        {total != null ? (
          <p className="flex justify-between border-t border-border px-4 py-3 font-bold">
            <span>{t("total")}</span>
            <span className="tabular-nums">{money(total)}</span>
          </p>
        ) : null}
      </section>
    );
    body = (
      <div className="space-y-3">
        <p
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-semibold",
            bs.balanced ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
          )}
        >
          {bs.balanced ? t("balanced") : t("unbalanced")} | {t("asOf", { day: day(to) })}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {col(t("assets"), bs.assets, null, bs.totals.assets)}
          <div className="space-y-4">
            {col(t("liabilities"), bs.liabilities, null, bs.totals.liabilities)}
            {col(
              t("equity"),
              bs.equity,
              <>
                {bs.priorResult ? (
                  <li className="flex justify-between px-4 py-2">
                    <span>{t("priorResult")}</span>
                    <span className="tabular-nums">{signed(bs.priorResult)}</span>
                  </li>
                ) : null}
                <li className="flex justify-between px-4 py-2 font-semibold">
                  <span>{t("periodResult", { from: day(bs.fiscalYearStart) })}</span>
                  <span className="tabular-nums">{signed(bs.result)}</span>
                </li>
              </>,
              bs.totals.equity,
            )}
          </div>
        </div>
      </div>
    );
  } else if (tab === "receivables") {
    const aged = await agedReceivables(db, ctx, to);
    body = (
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">{t("receivablesHint")}</p>
        <Table min={800}>
          <thead className="bg-surface-2">
            <tr>
              <th className={th}>{t("customer")}</th>
              <th className={thEnd}>{t("age.current")}</th>
              <th className={thEnd}>{t("age.d30")}</th>
              <th className={thEnd}>{t("age.d60")}</th>
              <th className={thEnd}>{t("age.d90")}</th>
              <th className={thEnd}>{t("total")}</th>
              <th className={thEnd}>{t("overdue")}</th>
            </tr>
          </thead>
          <tbody>
            {aged.accounts.map((a) => (
              <tr key={a.id}>
                <td className={cn(td, "font-semibold")}>
                  <Link href={`/dashboard/${rid}/customers/${a.id}`} className="hover:underline">
                    {a.name}
                  </Link>
                  {a.isBusiness ? (
                    <span className="ms-2 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-text">
                      B2B
                    </span>
                  ) : null}
                  {a.creditLimit != null && a.total > a.creditLimit ? (
                    <span className="ms-2 text-xs text-danger">{t("overLimit")}</span>
                  ) : null}
                </td>
                <td className={tdNum}>{money(a.current)}</td>
                <td className={tdNum}>{money(a.d30)}</td>
                <td className={tdNum}>{money(a.d60)}</td>
                <td className={cn(tdNum, a.d90 && "text-danger")}>{money(a.d90)}</td>
                <td className={cn(tdNum, "font-bold")}>{money(a.total)}</td>
                <td className={cn(tdNum, a.overdue && "font-semibold text-danger")}>{money(a.overdue)}</td>
              </tr>
            ))}
            {!aged.accounts.length ? (
              <tr>
                <td className="px-3 py-8 text-center text-fg-muted" colSpan={7}>
                  {t("noReceivables")}
                </td>
              </tr>
            ) : null}
          </tbody>
          {aged.accounts.length ? (
            <tfoot>
              <tr>
                <td className={td} colSpan={5}>
                  {t("total")}
                </td>
                <td className={tdNum}>{money(aged.totals.receivables)}</td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </Table>
      </div>
    );
  } else if (tab === "cheques") {
    const reg = await chequeRegister(db, ctx);
    const tStatus = await getTranslations("ledger.cheque.status");
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label={t("cheque.receivedOpen")}
            value={<span title={money(reg.totals.receivedOpen)}>{big(reg.totals.receivedOpen)}</span>}
            tone="indigo"
          />
          <StatCard
            label={t("cheque.issuedOpen")}
            value={<span title={money(reg.totals.issuedOpen)}>{big(reg.totals.issuedOpen)}</span>}
            tone="amber"
          />
          <StatCard
            label={t("cheque.bounced")}
            value={<span title={money(reg.totals.bounced)}>{big(reg.totals.bounced)}</span>}
            tone="rose"
          />
          <StatCard label={t("cheque.dueWeek")} value={reg.totals.dueThisWeek} tone="teal" />
        </div>
        <Table min={900}>
          <thead className="bg-surface-2">
            <tr>
              <th className={th}>{t("cheque.due")}</th>
              <th className={th}>{t("cheque.direction")}</th>
              <th className={th}>{t("cheque.party")}</th>
              <th className={th}>{t("cheque.ref")}</th>
              <th className={thEnd}>{t("amount")}</th>
              <th className={th}>{t("cheque.statusLabel")}</th>
              <th className="w-56" />
            </tr>
          </thead>
          <tbody>
            {reg.rows.map((c) => (
              <tr
                key={c.id}
                className={c.overdue ? "bg-danger-soft/40" : c.dueSoon ? "bg-warning-soft/40" : undefined}
              >
                <td className={cn(td, "font-semibold whitespace-nowrap")}>{day(c.dueDate)}</td>
                <td className={td}>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-semibold",
                      c.direction === "received" ? "text-accent-text" : "text-tone-orange",
                    )}
                  >
                    {c.direction === "received" ? "↓" : "↑"} {t(`cheque.${c.direction}`)}
                  </span>
                </td>
                <td className={td}>{c.party}</td>
                <td className={cn(td, "font-mono text-xs")} dir="ltr">
                  {[c.sayadId, c.number, c.bank].filter(Boolean).join(" | ")}
                </td>
                <td className={tdNum}>{money(c.amountCents)}</td>
                <td className={td}>
                  <span
                    className={cn(
                      "inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold",
                      CHEQUE_TONE[c.status] ?? "bg-surface-2 text-fg-muted",
                    )}
                  >
                    {tStatus(c.status)}
                  </span>
                </td>
                <td className="px-2 py-1 text-end">
                  <ChequeActions
                    restaurantId={rid}
                    chequeId={c.id}
                    direction={c.direction}
                    status={c.status}
                  />
                </td>
              </tr>
            ))}
            {!reg.rows.length ? (
              <tr>
                <td className="px-3 py-8 text-center text-fg-muted" colSpan={7}>
                  {t("cheque.none")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
        <p className="text-xs text-fg-muted">{t("cheque.hint")}</p>
      </div>
    );
  } else if (tab === "payables") {
    const ap = await payablesAging(db, ctx, to);
    body = (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <PaySupplierButton
            restaurantId={rid}
            currency={ctx.restaurant.currency}
            suppliers={ap.suppliers.map((x) => ({ id: x.id, name: x.name }))}
            today={today}
          />
          <p className="text-sm text-fg-muted">{t("payablesHint", { total: money(ap.total) })}</p>
        </div>
        <Table min={800}>
          <thead className="bg-surface-2">
            <tr>
              <th className={th}>{t("supplier")}</th>
              <th className={thEnd}>{t("invoiced")}</th>
              <th className={thEnd}>{t("paid")}</th>
              <th className={thEnd}>{t("age.current")}</th>
              <th className={thEnd}>{t("age.d30")}</th>
              <th className={thEnd}>{t("age.d60")}</th>
              <th className={thEnd}>{t("age.d90")}</th>
              <th className={thEnd}>{t("owed")}</th>
            </tr>
          </thead>
          <tbody>
            {ap.rows.map((r) => (
              <tr key={r.id}>
                <td className={cn(td, "font-semibold")}>{r.name}</td>
                <td className={tdNum}>{money(r.invoiced)}</td>
                <td className={tdNum}>{money(r.paid)}</td>
                <td className={tdNum}>{money(r.current)}</td>
                <td className={tdNum}>{money(r.d30)}</td>
                <td className={tdNum}>{money(r.d60)}</td>
                <td className={cn(tdNum, r.d90 ? "text-danger" : "")}>{money(r.d90)}</td>
                <td className={cn(tdNum, "font-bold")}>{signed(r.total)}</td>
              </tr>
            ))}
            {!ap.rows.length ? (
              <tr>
                <td className="px-3 py-8 text-center text-fg-muted" colSpan={8}>
                  {t("noPayables")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
        {ap.recent.length ? (
          <section>
            <h2 className="mb-2 font-semibold">{t("recentPayments")}</h2>
            <Table>
              <tbody>
                {ap.recent.map((p) => (
                  <tr key={p.id}>
                    <td className={td}>{day(p.paidOn)}</td>
                    <td className={td}>{p.supplier}</td>
                    <td className={td}>{t(`methods.${p.method}`)}</td>
                    <td className={tdNum}>{money(p.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
        ) : null}
      </div>
    );
  } else if (tab === "tax") {
    const rows = await taxReport(db, ctx, from, to);
    const seasonal = EDITION === "iran";
    const seasons = [...new Set(rows.map((r) => `${r.month.slice(0, 4)}-${r.season}`))];
    body = (
      <Table>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>{t("month")}</th>
            <th className={thEnd}>{t("vatCollected")}</th>
          </tr>
        </thead>
        <tbody>
          {(seasonal ? seasons : [""]).map((sk) => {
            const list = seasonal ? rows.filter((r) => `${r.month.slice(0, 4)}-${r.season}` === sk) : rows;
            return [
              ...list.map((r) => (
                <tr key={r.month}>
                  <td className={td}>{monthName(r.month)}</td>
                  <td className={tdNum}>{money(r.vat)}</td>
                </tr>
              )),
              seasonal ? (
                <tr key={`s${sk}`} className="bg-surface-2/60 font-semibold">
                  <td className={td}>
                    {t("season", {
                      season: t(`seasons.${sk.slice(5)}`),
                      year: monthName(`${sk.slice(0, 4)}-01`, { year: "numeric" }),
                    })}
                  </td>
                  <td className={tdNum}>{money(list.reduce((x, r) => x + r.vat, 0))}</td>
                </tr>
              ) : null,
            ];
          })}
          {!rows.length ? (
            <tr>
              <td className="px-3 py-8 text-center text-fg-muted" colSpan={2}>
                {t("noTax")}
              </td>
            </tr>
          ) : null}
        </tbody>
      </Table>
    );
  } else if (tab === "bank") {
    const cash = await cashSummary(db, ctx, from, to);
    const accountId = typeof sp.account === "string" ? sp.account : cash[0]?.id;
    const rec = accountId ? await unreconciled(db, ctx, accountId) : null;
    body = (
      <div className="space-y-5">
        <Table>
          <thead className="bg-surface-2">
            <tr>
              <th className={th}>{t("account")}</th>
              <th className={thEnd}>{t("opening")}</th>
              <th className={thEnd}>{t("inflow")}</th>
              <th className={thEnd}>{t("outflow")}</th>
              <th className={thEnd}>{t("closing")}</th>
            </tr>
          </thead>
          <tbody>
            {cash.map((c) => (
              <tr key={c.id} className={c.id === accountId ? "bg-accent-soft/40" : undefined}>
                <td className={td}>
                  <Link href={q({ account: c.id })} className="font-semibold hover:underline">
                    {c.code} {c.name}
                  </Link>
                </td>
                <td className={tdNum}>{signed(c.opening)}</td>
                <td className={tdNum}>{money(c.inflow)}</td>
                <td className={tdNum}>{money(c.outflow)}</td>
                <td className={cn(tdNum, "font-semibold")}>{signed(c.closing)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        {rec ? (
          <section>
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              <Banknote className="size-4" aria-hidden="true" />
              {t("reconcileTitle", { account: rec.account.name })}
            </h2>
            <ReconcileTable
              restaurantId={rid}
              currency={ctx.restaurant.currency}
              accountId={rec.account.id}
              clearedCents={rec.clearedBalanceCents}
              lines={rec.lines}
            />
          </section>
        ) : null}
      </div>
    );
  } else if (tab === "chart") {
    const months = fiscalYearMonths(to);
    const year = monthName(months[0]!, { year: "numeric" });
    const budgets = await budgetsFor(db, rid, months[0]!, months[11]!);
    const bmap = new Map(budgets.map((b) => [`${b.accountId}|${b.month}`, b.amountCents]));
    body = (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <LedgerAccountButton restaurantId={rid} />
          <p className="text-sm text-fg-muted">{t("chartHint")}</p>
        </div>
        <Table>
          <thead className="bg-surface-2">
            <tr>
              <th className={th}>{t("code")}</th>
              <th className={th}>{t("name")}</th>
              <th className={th}>{t("accountType")}</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className={a.active ? undefined : "opacity-50"}>
                <td className={cn(td, "font-mono text-xs")}>{a.code}</td>
                <td className={td}>
                  {a.name}
                  {a.systemKey ? (
                    <span className="ms-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-muted">
                      {t("auto")}
                    </span>
                  ) : null}
                </td>
                <td className={td}>{tType(a.type)}</td>
                <td className="px-2 text-end">
                  <LedgerAccountButton restaurantId={rid} account={a} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <section>
          <h2 className="mb-2 font-semibold">{t("budgetsTitle", { year })}</h2>
          <Table min={1200}>
            <thead className="bg-surface-2">
              <tr>
                <th className={th}>{t("account")}</th>
                {months.map((m) => (
                  <th key={m} className={thEnd}>
                    {monthName(m, { month: "short" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts
                .filter((a) => a.active && (a.type === "revenue" || a.type === "expense"))
                .map((a) => (
                  <tr key={a.id}>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <span className="font-mono text-xs text-fg-muted">{a.code}</span> {a.name}
                    </td>
                    {months.map((m) => (
                      <td key={m} className="px-1 py-1 text-end">
                        <BudgetCell
                          restaurantId={rid}
                          currency={ctx.restaurant.currency}
                          accountId={a.id}
                          month={m}
                          amountCents={bmap.get(`${a.id}|${m}`) ?? null}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </Table>
        </section>
      </div>
    );
  } else {
    body = (
      <div className="max-w-2xl space-y-5">
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">{t("closeTitle")}</h2>
          <p className="text-sm text-fg-muted">{t("closeHint")}</p>
          <p className="text-sm font-semibold">
            {state?.lockedUntil ? t("lockedUntil", { day: day(state.lockedUntil) }) : t("notLocked")}
          </p>
          <LockForm
            restaurantId={rid}
            lockedUntil={state?.lockedUntil ?? null}
            isOwner={ctx.role === "owner"}
          />
        </section>
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">{t("exportTitle")}</h2>
          <p className="text-sm text-fg-muted">{t(EDITION === "iran" ? "exportHintIran" : "exportHint")}</p>
          <a
            href={`${locale === DEFAULT_LOCALE ? "" : `/${locale}`}/dashboard/${rid}/accounting/${EDITION === "iran" ? "export" : "fec"}?from=${from}&to=${to}`}
            className={buttonClasses("secondary", "md")}
          >
            <Download className="size-4" aria-hidden="true" />
            {t(EDITION === "iran" ? "exportExcel" : "exportFec", { from: day(from), to: day(to) })}
          </a>
        </section>
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">{t("syncTitle")}</h2>
          <p className="text-sm text-fg-muted">{t("syncHint")}</p>
          <SyncButton restaurantId={rid} />
        </section>
      </div>
    );
  }

  const group = GROUPS.find((g) => g.tabs.includes(tab)) ?? GROUPS[0]!;
  const presets = [
    { k: "thisMonth", f: monthStart(today), to: today },
    {
      k: "lastMonth",
      f: monthStart(addDays(monthStart(today), -1)),
      to: addDays(monthStart(today), -1),
    },
    { k: "fiscalYear", f: fiscalYearStart(today), to: today },
  ];
  const preset = presets.find((p) => p.f === from && p.to === to);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      {/* Rooms of the books, then the pages of the open room. */}
      <nav aria-label={t("title")} className="mb-3">
        <div className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max min-w-full gap-1 rounded-xl bg-accent-soft/50 p-1 ring-1 ring-accent/15 ring-inset">
            {GROUPS.map((g) => {
              const active = g.key === group.key;
              return (
                <li key={g.key} className="flex-1">
                  <Link
                    href={`${base}?${new URLSearchParams({ tab: g.tabs[0]!, from, to })}`}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition-[background-color,color,box-shadow] duration-150",
                      active
                        ? "bg-surface text-accent-text shadow-[0_1px_3px_hsl(var(--shadow-color)/0.12)] ring-1 ring-accent/25"
                        : "text-fg-muted hover:bg-accent-soft hover:text-accent-text",
                    )}
                  >
                    <g.Icon
                      className={cn("size-4 shrink-0", active ? "text-accent" : "opacity-70")}
                      aria-hidden="true"
                    />
                    {t(`groups.${g.key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        {group.tabs.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {group.tabs.map((k) => (
              <Link
                key={k}
                href={`${base}?${new URLSearchParams({ tab: k, from, to })}`}
                aria-current={k === tab ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-semibold transition-colors duration-150",
                  k === tab
                    ? "bg-accent text-white"
                    : "text-fg-muted ring-1 ring-border ring-inset hover:bg-accent-soft/50 hover:text-accent-text",
                )}
              >
                {t(`tabs.${k}`)}
              </Link>
            ))}
          </div>
        ) : null}
      </nav>

      {/* Period: three presets, or any range. */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-[var(--shadow-soft)]">
        <span className="flex items-center gap-1.5 px-2 text-sm font-semibold text-accent-text">
          <CalendarRange className="size-4 text-accent" aria-hidden="true" />
          <bdi>
            {day(from)} – {day(to)}
          </bdi>
        </span>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <Link
              key={p.k}
              href={`${base}?${new URLSearchParams({ tab, from: p.f, to: p.to })}`}
              className={cn(
                "inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-semibold transition-colors duration-150",
                preset?.k === p.k
                  ? "bg-accent-soft text-accent-text ring-1 ring-accent/25 ring-inset"
                  : "text-fg-muted hover:bg-accent-soft/50 hover:text-accent-text",
              )}
            >
              {t(`quick.${p.k}`)}
            </Link>
          ))}
        </div>
        <form className="ms-auto flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="tab" value={tab} />
          {typeof sp.account === "string" ? <input type="hidden" name="account" value={sp.account} /> : null}
          <label className="sr-only" htmlFor="ledger-from">
            {t("from")}
          </label>
          <DateInput
            id="ledger-from"
            name="from"
            defaultValue={from}
            className="h-8 rounded-lg border border-border bg-surface px-2.5 text-[13px]"
          />
          <span className="text-fg-subtle" aria-hidden="true">
            →
          </span>
          <label className="sr-only" htmlFor="ledger-to">
            {t("to")}
          </label>
          <DateInput
            id="ledger-to"
            name="to"
            defaultValue={to}
            className="h-8 rounded-lg border border-border bg-surface px-2.5 text-[13px]"
          />
          <button className={buttonClasses("secondary", "sm")}>{t("apply")}</button>
        </form>
        {state?.lockedUntil ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent-soft/50 px-3 text-xs font-semibold text-accent-text">
            <Lock className="size-3.5" aria-hidden="true" />
            {t("lockedUntil", { day: day(state.lockedUntil) })}
          </span>
        ) : null}
      </div>
      {body}
    </>
  );
}
