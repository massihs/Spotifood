import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  cheques,
  customerAccountEntries,
  customers,
  diningTables,
  invoices,
  orderItems,
  orders,
  payments,
  refunds,
  reservations,
  restaurantSettings,
  sessionParticipants,
  tableSessions,
  users,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { PRESETS, type Preset } from "@/lib/period";
import type { Range } from "./service";

/**
 * The report centre of a restaurant, modelled on the reports hotel and restaurant software in Iran
 * offers (credit accounts, account statement, sales plans, bank, invoices, charts, daily sales,
 * upcoming and walk-in guests, occupancy, sales per person, open bills, debtors, charges on
 * account, settings and the comprehensive report), adapted to a venue that sells meals.
 */

const n = (s: ReturnType<typeof sql<number>>) => s.mapWith(Number);
const sum = (c: unknown) => n(sql<number>`coalesce(sum(${c}), 0)`);
const count = () => n(sql<number>`count(*)`);
const DAY_MS = 86_400_000;

// ─── Settings ────────────────────────────────────────────────────────────────

export type ReportSettings = { dayStartHour: number; defaultPreset: Preset };
export const DEFAULT_REPORT_SETTINGS: ReportSettings = { dayStartHour: 0, defaultPreset: "30d" };

export const reportSettingsSchema = z.object({
  /** The business day starts at this hour (a bar closing at 3 a.m. counts the night in the day before). */
  dayStartHour: z.coerce.number().int().min(0).max(6),
  defaultPreset: z.enum(PRESETS).refine((p) => p !== "custom"),
});

export async function getReportSettings(db: DbOrTx, restaurantId: string): Promise<ReportSettings> {
  const [row] = await db
    .select({ s: restaurantSettings.reportSettings })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));
  return { ...DEFAULT_REPORT_SETTINGS, ...(row?.s ?? {}) };
}

export async function saveReportSettings(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "accounting.manage");
  const s = reportSettingsSchema.parse(raw);
  await db
    .update(restaurantSettings)
    .set({ reportSettings: s })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "reports.settings",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: s,
  });
}

/** The period moved to the business day (e.g. 4 a.m. to 4 a.m.). */
export const businessRange = (r: Range, hour: number): Range =>
  hour
    ? { from: new Date(r.from.getTime() + hour * 3_600_000), to: new Date(r.to.getTime() + hour * 3_600_000) }
    : r;

/** Local business day of a timestamp column ("YYYY-MM-DD"). */
const businessDay = (col: unknown, tz: string, hour: number) =>
  sql<string>`to_char((${col} at time zone ${tz}) - make_interval(hours => ${hour}), 'YYYY-MM-DD')`;

const salesWhere = (rid: string, r: Range) =>
  and(
    eq(orders.restaurantId, rid),
    gte(orders.placedAt, r.from),
    lt(orders.placedAt, r.to),
    notInArray(orders.status, ["cancelled", "pending_payment"]),
  );

const paidWhere = (rid: string, r: Range) =>
  and(
    eq(payments.restaurantId, rid),
    sql`${payments.status} in ('succeeded', 'partially_refunded', 'refunded')`,
    gte(payments.succeededAt, r.from),
    lt(payments.succeededAt, r.to),
  );

/** How a payment provider is shown and counted: cash, card, online, account, other. */
export const methodOf = (provider: string) =>
  provider === "cash"
    ? "cash"
    : provider === "on_site_terminal" || provider === "card"
      ? "card"
      : provider === "account"
        ? "account"
        : ["zarinpal", "stripe", "mock_online", "online"].includes(provider)
          ? "online"
          : "other";

// ─── Daily sales (گزارش فروش روزانه) ──────────────────────────────────────────

/** Each business day: orders, gross, discounts, VAT, total, and the money taken per method. */
export async function dailySales(db: DbOrTx, ctx: RestaurantContext, r: Range, hour = 0) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const day = businessDay(orders.placedAt, tz, hour);
  const payDay = businessDay(payments.succeededAt, tz, hour);
  const [rows, pays] = await Promise.all([
    db
      .select({
        day,
        orders: count(),
        subtotalCents: sum(orders.subtotalCents),
        discountCents: sum(orders.discountCents),
        taxCents: sum(orders.taxCents),
        totalCents: sum(orders.totalCents),
        b2bCents: sum(sql`case when ${orders.isB2b} then ${orders.totalCents} else 0 end`),
      })
      .from(orders)
      .where(salesWhere(rid, r))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        day: payDay,
        provider: payments.provider,
        amountCents: sum(sql`${payments.amountCents} - ${payments.refundedCents}`),
      })
      .from(payments)
      .where(paidWhere(rid, r))
      .groupBy(sql`1`, payments.provider),
  ]);
  const days = new Map(
    rows.map((d) => [
      d.day,
      {
        ...d,
        netCents: d.totalCents - d.taxCents,
        avgCents: d.orders ? Math.round(d.totalCents / d.orders) : 0,
        cash: 0,
        card: 0,
        online: 0,
        account: 0,
        other: 0,
      },
    ]),
  );
  for (const p of pays) {
    const d = days.get(p.day) ?? {
      day: p.day,
      orders: 0,
      subtotalCents: 0,
      discountCents: 0,
      taxCents: 0,
      totalCents: 0,
      b2bCents: 0,
      netCents: 0,
      avgCents: 0,
      cash: 0,
      card: 0,
      online: 0,
      account: 0,
      other: 0,
    };
    d[methodOf(p.provider)] += p.amountCents;
    days.set(p.day, d);
  }
  const list = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  const total = list.reduce(
    (s, d) => {
      for (const k of [
        "orders",
        "subtotalCents",
        "discountCents",
        "taxCents",
        "totalCents",
        "netCents",
        "b2bCents",
        "cash",
        "card",
        "online",
        "account",
        "other",
      ] as const)
        s[k] += d[k];
      return s;
    },
    {
      orders: 0,
      subtotalCents: 0,
      discountCents: 0,
      taxCents: 0,
      totalCents: 0,
      netCents: 0,
      b2bCents: 0,
      cash: 0,
      card: 0,
      online: 0,
      account: 0,
      other: 0,
    },
  );
  return { days: list, total };
}

// ─── Sales plans (گزارش پلن فروش) ─────────────────────────────────────────────

export const PLANS = [
  "dine_in_staff",
  "dine_in_qr",
  "takeaway_counter",
  "takeaway_online",
  "delivery_phone",
  "delivery_online",
  "room",
  "b2b",
] as const;

/**
 * Sales per selling formula: table served by a waiter or ordered by QR, counter or online
 * takeaway, delivery by phone or online, room service, trade sales (B2B).
 */
export async function salesPlans(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "accounting.manage");
  const plan = sql<string>`case
    when ${orders.isB2b} then 'b2b'
    when ${orders.placeKind} = 'room' then 'room'
    when ${orders.channel} = 'dine_in' and ${orders.createdByUserId} is null then 'dine_in_qr'
    when ${orders.channel} = 'dine_in' then 'dine_in_staff'
    when ${orders.channel} = 'takeaway' and ${orders.createdByUserId} is null then 'takeaway_online'
    when ${orders.channel} = 'takeaway' then 'takeaway_counter'
    when ${orders.createdByUserId} is null then 'delivery_online'
    else 'delivery_phone' end`;
  const [rows, items] = await Promise.all([
    db
      .select({
        plan,
        orders: count(),
        discountCents: sum(orders.discountCents),
        taxCents: sum(orders.taxCents),
        totalCents: sum(orders.totalCents),
      })
      .from(orders)
      .where(salesWhere(ctx.restaurant.id, r))
      .groupBy(sql`1`),
    db
      .select({ plan, items: sum(orderItems.quantity) })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(salesWhere(ctx.restaurant.id, r))
      .groupBy(sql`1`),
  ]);
  const total = rows.reduce((s, x) => s + x.totalCents, 0);
  const qty = new Map(items.map((i) => [i.plan, i.items]));
  return {
    total,
    rows: PLANS.map((p) => {
      const x = rows.find((y) => y.plan === p);
      const t = x?.totalCents ?? 0;
      return {
        plan: p,
        orders: x?.orders ?? 0,
        items: qty.get(p) ?? 0,
        discountCents: x?.discountCents ?? 0,
        taxCents: x?.taxCents ?? 0,
        totalCents: t,
        avgCents: x?.orders ? Math.round(t / x.orders) : 0,
        share: total ? t / total : 0,
      };
    }).filter((x) => x.orders > 0),
  };
}

// ─── Bank (گزارش بانک) ────────────────────────────────────────────────────────

/**
 * What goes to the bank: card terminal and online payments (with their references), account
 * repayments by card or transfer, cheques received and cleared, refunds.
 */
export async function bankReport(db: DbOrTx, ctx: RestaurantContext, r: Range, hour = 0) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const [byMethod, byDay, recent, repayments, refunded, chequeRows] = await Promise.all([
    db
      .select({ provider: payments.provider, count: count(), amountCents: sum(payments.amountCents) })
      .from(payments)
      .where(paidWhere(rid, r))
      .groupBy(payments.provider),
    db
      .select({
        day: businessDay(payments.succeededAt, tz, hour),
        provider: payments.provider,
        amountCents: sum(payments.amountCents),
      })
      .from(payments)
      .where(and(paidWhere(rid, r), sql`${payments.provider} not in ('cash', 'account')`))
      .groupBy(sql`1`, payments.provider)
      .orderBy(sql`1`),
    db
      .select({
        id: payments.id,
        at: payments.succeededAt,
        provider: payments.provider,
        amountCents: payments.amountCents,
        refundedCents: payments.refundedCents,
        providerRef: payments.providerRef,
        terminalRef: sql<string | null>`${payments.metadata}->>'terminalRef'`,
        by: users.fullName,
      })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.recordedByUserId))
      .where(and(paidWhere(rid, r), sql`${payments.provider} not in ('cash', 'account')`))
      .orderBy(desc(payments.succeededAt))
      .limit(300),
    db
      .select({
        method: customerAccountEntries.method,
        count: count(),
        amountCents: sum(customerAccountEntries.amountCents),
      })
      .from(customerAccountEntries)
      .where(
        and(
          eq(customerAccountEntries.restaurantId, rid),
          eq(customerAccountEntries.kind, "payment"),
          gte(customerAccountEntries.createdAt, r.from),
          lt(customerAccountEntries.createdAt, r.to),
        ),
      )
      .groupBy(customerAccountEntries.method),
    db
      .select({ provider: payments.provider, count: count(), amountCents: sum(refunds.amountCents) })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .where(
        and(
          eq(refunds.restaurantId, rid),
          eq(refunds.status, "succeeded"),
          gte(refunds.updatedAt, r.from),
          lt(refunds.updatedAt, r.to),
        ),
      )
      .groupBy(payments.provider),
    db
      .select({
        status: cheques.status,
        direction: cheques.direction,
        count: count(),
        amountCents: sum(cheques.amountCents),
      })
      .from(cheques)
      .where(and(eq(cheques.restaurantId, rid), gte(cheques.updatedAt, r.from), lt(cheques.updatedAt, r.to)))
      .groupBy(cheques.status, cheques.direction),
  ]);
  const methods = { cash: 0, card: 0, online: 0, account: 0, other: 0 };
  for (const m of byMethod) methods[methodOf(m.provider)] += m.amountCents;
  const repaid = { cash: 0, card: 0, transfer: 0, cheque: 0 };
  for (const x of repayments) {
    const k = (x.method ?? "cash") as keyof typeof repaid;
    if (k in repaid) repaid[k] += -x.amountCents;
  }
  const refundTotal = refunded.reduce((s, x) => s + x.amountCents, 0);
  const days = new Map<string, { day: string; card: number; online: number; other: number }>();
  for (const d of byDay) {
    const cur = days.get(d.day) ?? { day: d.day, card: 0, online: 0, other: 0 };
    const m = methodOf(d.provider);
    if (m === "card" || m === "online") cur[m] += d.amountCents;
    else cur.other += d.amountCents;
    days.set(d.day, cur);
  }
  return {
    methods,
    byProvider: byMethod.sort((a, b) => b.amountCents - a.amountCents),
    repaid,
    refunds: refundTotal,
    cheques: chequeRows,
    /** Card and online money plus repayments by card or transfer, less refunds to cards. */
    bankCents: methods.card + methods.online + repaid.card + repaid.transfer - refundTotal,
    days: [...days.values()],
    recent: recent.map((x) => ({ ...x, method: methodOf(x.provider) })),
  };
}

// ─── Credit accounts (گزارش حساب‌های اعتباری) ─────────────────────────────────

/** Every customer with an account: limit, what they owe, what is left, movements of the period. */
export async function creditAccounts(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const [list, moves] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        isBusiness: customers.isBusiness,
        creditLimitCents: customers.creditLimitCents,
        balanceCents: customers.balanceCents,
        paymentTermsDays: customers.paymentTermsDays,
      })
      .from(customers)
      .where(
        and(
          eq(customers.restaurantId, rid),
          or(isNotNull(customers.creditLimitCents), sql`${customers.balanceCents} <> 0`),
        ),
      )
      .orderBy(desc(customers.balanceCents)),
    db
      .select({
        customerId: customerAccountEntries.customerId,
        charges: sum(
          sql`case when ${customerAccountEntries.amountCents} > 0 then ${customerAccountEntries.amountCents} else 0 end`,
        ),
        payments: sum(
          sql`case when ${customerAccountEntries.amountCents} < 0 then -${customerAccountEntries.amountCents} else 0 end`,
        ),
        last: sql<Date | null>`max(${customerAccountEntries.createdAt})`.mapWith((v) =>
          v ? new Date(v) : null,
        ),
      })
      .from(customerAccountEntries)
      .where(
        and(
          eq(customerAccountEntries.restaurantId, rid),
          gte(customerAccountEntries.createdAt, r.from),
          lt(customerAccountEntries.createdAt, r.to),
        ),
      )
      .groupBy(customerAccountEntries.customerId),
  ]);
  const m = new Map(moves.map((x) => [x.customerId, x]));
  const rows = list.map((c) => ({
    ...c,
    availableCents: c.creditLimitCents != null ? c.creditLimitCents - c.balanceCents : null,
    chargesCents: m.get(c.id)?.charges ?? 0,
    paymentsCents: m.get(c.id)?.payments ?? 0,
    lastAt: m.get(c.id)?.last ?? null,
  }));
  return {
    rows,
    totals: {
      limit: rows.reduce((s, x) => s + (x.creditLimitCents ?? 0), 0),
      balance: rows.reduce((s, x) => s + x.balanceCents, 0),
      charges: rows.reduce((s, x) => s + x.chargesCents, 0),
      payments: rows.reduce((s, x) => s + x.paymentsCents, 0),
    },
  };
}

// ─── Account statement (گزارش عملکرد حساب اعتباری) ────────────────────────────

/** One customer's account over the period: opening balance, each charge and payment, closing. */
export async function accountStatement(db: DbOrTx, ctx: RestaurantContext, customerId: string, r: Range) {
  assertCan(ctx, "accounting.manage");
  if (!isUuid(customerId)) throw notFound();
  const rid = ctx.restaurant.id;
  const [c] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.restaurantId, rid)));
  if (!c) throw notFound();
  const [[before], entries] = await Promise.all([
    db
      .select({ v: sum(customerAccountEntries.amountCents) })
      .from(customerAccountEntries)
      .where(and(eq(customerAccountEntries.customerId, c.id), lt(customerAccountEntries.createdAt, r.from))),
    db
      .select({
        id: customerAccountEntries.id,
        at: customerAccountEntries.createdAt,
        kind: customerAccountEntries.kind,
        amountCents: customerAccountEntries.amountCents,
        method: customerAccountEntries.method,
        note: customerAccountEntries.note,
        orderNumber: orders.number,
        by: users.fullName,
      })
      .from(customerAccountEntries)
      .leftJoin(orders, eq(orders.id, customerAccountEntries.orderId))
      .leftJoin(users, eq(users.id, customerAccountEntries.actorUserId))
      .where(
        and(
          eq(customerAccountEntries.customerId, c.id),
          gte(customerAccountEntries.createdAt, r.from),
          lt(customerAccountEntries.createdAt, r.to),
        ),
      )
      .orderBy(asc(customerAccountEntries.createdAt))
      .limit(2000),
  ]);
  let running = before?.v ?? 0;
  const lines = entries.map((e) => {
    running += e.amountCents;
    return { ...e, balanceCents: running };
  });
  return {
    customer: {
      id: c.id,
      name: c.name,
      phone: c.phone,
      isBusiness: c.isBusiness,
      creditLimitCents: c.creditLimitCents,
    },
    openingCents: before?.v ?? 0,
    chargesCents: entries.filter((e) => e.amountCents > 0).reduce((s, e) => s + e.amountCents, 0),
    paymentsCents: -entries.filter((e) => e.amountCents < 0).reduce((s, e) => s + e.amountCents, 0),
    closingCents: running,
    lines,
  };
}

// ─── Debtors and open bills (بدهکاران و رجیسترهای مانده‌دار) ────────────────────

/** Orders served but not paid (not cancelled), oldest first, with who they belong to. */
async function unpaidOrders(db: DbOrTx, rid: string, extra?: ReturnType<typeof and>) {
  return db
    .select({
      id: orders.id,
      number: orders.number,
      placedAt: orders.placedAt,
      channel: orders.channel,
      tableLabel: orders.tableLabel,
      tableSessionId: orders.tableSessionId,
      totalCents: orders.totalCents,
      customerName: customers.name,
      customerPhone: orders.customerPhone,
      isB2b: orders.isB2b,
    })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        eq(orders.restaurantId, rid),
        inArray(orders.paymentStatus, ["unpaid", "pending"]),
        notInArray(orders.status, ["cancelled", "pending_payment"]),
        extra,
      ),
    )
    .orderBy(asc(orders.placedAt))
    .limit(500);
}

/**
 * Open bills (رجیسترهای مانده‌دار): tables still open with what they owe, and today's counter
 * orders not paid yet.
 */
export async function openBills(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "orders.view");
  const rid = ctx.restaurant.id;
  const [sessions, unpaid] = await Promise.all([
    db
      .select({
        id: tableSessions.id,
        openedAt: tableSessions.openedAt,
        lastActivityAt: tableSessions.lastActivityAt,
        label: diningTables.label,
        kind: diningTables.kind,
        guests: n(
          sql<number>`(select count(*) from session_participants sp where sp.table_session_id = "table_sessions"."id")`,
        ),
      })
      .from(tableSessions)
      .innerJoin(diningTables, eq(diningTables.id, tableSessions.tableId))
      .where(and(eq(tableSessions.restaurantId, rid), eq(tableSessions.status, "open")))
      .orderBy(asc(tableSessions.openedAt)),
    unpaidOrders(db, rid),
  ]);
  const bySession = new Map<string, { orders: number; dueCents: number }>();
  for (const o of unpaid)
    if (o.tableSessionId) {
      const cur = bySession.get(o.tableSessionId) ?? { orders: 0, dueCents: 0 };
      cur.orders++;
      cur.dueCents += o.totalCents;
      bySession.set(o.tableSessionId, cur);
    }
  const tables = sessions.map((s) => ({ ...s, ...(bySession.get(s.id) ?? { orders: 0, dueCents: 0 }) }));
  const loose = unpaid.filter((o) => !o.tableSessionId || !sessions.some((s) => s.id === o.tableSessionId));
  return {
    tables,
    orders: loose,
    totals: {
      tables: tables.filter((t) => t.dueCents > 0).length,
      dueCents: tables.reduce((s, t) => s + t.dueCents, 0) + loose.reduce((s, o) => s + o.totalCents, 0),
    },
  };
}

/** Debtors (بدهکاران): customers owing on their account, and unpaid orders older than a day. */
export async function debtors(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const dayAgo = new Date(Date.now() - DAY_MS);
  const [accounts, oldOrders] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        isBusiness: customers.isBusiness,
        balanceCents: customers.balanceCents,
        creditLimitCents: customers.creditLimitCents,
        paymentTermsDays: customers.paymentTermsDays,
        oldest:
          sql<Date | null>`(select min(e.created_at) from customer_account_entries e where e.customer_id = "customers"."id" and e.amount_cents > 0)`.mapWith(
            (v) => (v ? new Date(v) : null),
          ),
      })
      .from(customers)
      .where(and(eq(customers.restaurantId, rid), sql`${customers.balanceCents} > 0`))
      .orderBy(desc(customers.balanceCents)),
    unpaidOrders(db, rid, and(lt(orders.placedAt, dayAgo))),
  ]);
  return {
    accounts,
    orders: oldOrders,
    totals: {
      accounts: accounts.reduce((s, a) => s + a.balanceCents, 0),
      orders: oldOrders.reduce((s, o) => s + o.totalCents, 0),
    },
  };
}

// ─── Charges on account (روم شارژ) ────────────────────────────────────────────

/**
 * What was put on account in the period: sales on a customer's account (نسیه, trade customers)
 * and, in a hotel, room service charged to the rooms.
 */
export async function chargesOnAccount(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const [charges, rooms] = await Promise.all([
    db
      .select({
        id: customerAccountEntries.id,
        at: customerAccountEntries.createdAt,
        amountCents: customerAccountEntries.amountCents,
        customerId: customers.id,
        name: customers.name,
        phone: customers.phone,
        isBusiness: customers.isBusiness,
        orderNumber: orders.number,
      })
      .from(customerAccountEntries)
      .innerJoin(customers, eq(customers.id, customerAccountEntries.customerId))
      .leftJoin(orders, eq(orders.id, customerAccountEntries.orderId))
      .where(
        and(
          eq(customerAccountEntries.restaurantId, rid),
          eq(customerAccountEntries.kind, "charge"),
          gte(customerAccountEntries.createdAt, r.from),
          lt(customerAccountEntries.createdAt, r.to),
        ),
      )
      .orderBy(desc(customerAccountEntries.createdAt))
      .limit(1000),
    db
      .select({
        id: orders.id,
        number: orders.number,
        at: orders.placedAt,
        room: orders.tableLabel,
        totalCents: orders.totalCents,
        paymentStatus: orders.paymentStatus,
      })
      .from(orders)
      .where(and(salesWhere(rid, r), eq(orders.placeKind, "room")))
      .orderBy(desc(orders.placedAt))
      .limit(1000),
  ]);
  const byCustomer = new Map<
    string,
    { name: string; isBusiness: boolean; count: number; amountCents: number }
  >();
  for (const c of charges) {
    const cur = byCustomer.get(c.customerId) ?? {
      name: c.name ?? c.phone,
      isBusiness: c.isBusiness,
      count: 0,
      amountCents: 0,
    };
    cur.count++;
    cur.amountCents += c.amountCents;
    byCustomer.set(c.customerId, cur);
  }
  return {
    charges,
    byCustomer: [...byCustomer.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.amountCents - a.amountCents),
    rooms,
    totals: {
      charges: charges.reduce((s, c) => s + c.amountCents, 0),
      rooms: rooms.reduce((s, o) => s + o.totalCents, 0),
    },
  };
}

// ─── Guests: upcoming bookings, walk-ins, occupancy ──────────────────────────

/** Bookings to come (میهمانان آینده): the next days, with covers per day. */
export async function upcomingGuests(db: DbOrTx, ctx: RestaurantContext, days = 14) {
  assertCan(ctx, "orders.view");
  const rid = ctx.restaurant.id;
  const now = new Date();
  const list = await db
    .select({
      id: reservations.id,
      name: reservations.name,
      phone: reservations.phone,
      partySize: reservations.partySize,
      startsAt: reservations.startsAt,
      status: reservations.status,
      source: reservations.source,
      occasion: reservations.occasion,
      note: reservations.note,
      table: diningTables.label,
    })
    .from(reservations)
    .leftJoin(diningTables, eq(diningTables.id, reservations.tableId))
    .where(
      and(
        eq(reservations.restaurantId, rid),
        eq(reservations.kind, "booking"),
        gte(reservations.startsAt, new Date(now.getTime() - 3_600_000)),
        lt(reservations.startsAt, new Date(now.getTime() + days * DAY_MS)),
        notInArray(reservations.status, ["cancelled", "no_show", "completed", "seated"]),
      ),
    )
    .orderBy(asc(reservations.startsAt))
    .limit(1000);
  return {
    list,
    totals: { bookings: list.length, covers: list.reduce((s, b) => s + b.partySize, 0) },
  };
}

type Visit = { at: Date; end: Date; tableId: string; covers: number; booked: boolean };

/** Table visits of the period, each matched (or not) with a booking seated at that table. */
async function visits(db: DbOrTx, rid: string, r: Range): Promise<Visit[]> {
  const [sessions, booked] = await Promise.all([
    db
      .select({
        id: tableSessions.id,
        tableId: tableSessions.tableId,
        openedAt: tableSessions.openedAt,
        closedAt: tableSessions.closedAt,
        lastActivityAt: tableSessions.lastActivityAt,
        guests: n(
          sql<number>`(select count(*) from session_participants sp where sp.table_session_id = "table_sessions"."id")`,
        ),
      })
      .from(tableSessions)
      .innerJoin(diningTables, eq(diningTables.id, tableSessions.tableId))
      .where(
        and(
          eq(tableSessions.restaurantId, rid),
          eq(diningTables.kind, "table"),
          gte(tableSessions.openedAt, r.from),
          lt(tableSessions.openedAt, r.to),
        ),
      ),
    db
      .select({
        tableId: reservations.tableId,
        startsAt: reservations.startsAt,
        seatedAt: reservations.seatedAt,
        partySize: reservations.partySize,
        source: reservations.source,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, rid),
          gte(reservations.startsAt, new Date(r.from.getTime() - 3 * 3_600_000)),
          lt(reservations.startsAt, new Date(r.to.getTime() + 3 * 3_600_000)),
          inArray(reservations.status, ["seated", "completed"]),
        ),
      ),
  ]);
  const used = new Set<number>();
  return sessions.map((s) => {
    // A booking seated at this table within an hour and a half of the opening.
    const i = booked.findIndex(
      (b, k) =>
        !used.has(k) &&
        b.tableId === s.tableId &&
        b.source !== "walk_in" &&
        Math.abs((b.seatedAt ?? b.startsAt).getTime() - s.openedAt.getTime()) < 90 * 60_000,
    );
    if (i >= 0) used.add(i);
    const end = s.closedAt ?? s.lastActivityAt;
    return {
      at: s.openedAt,
      // A table left open overnight counts for 4 hours at most.
      end: new Date(Math.min(end.getTime(), s.openedAt.getTime() + 4 * 3_600_000)),
      tableId: s.tableId,
      covers: i >= 0 ? booked[i]!.partySize : Math.max(1, s.guests),
      booked: i >= 0,
    };
  });
}

const localParts = (d: Date, tz: string) => {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(d);
  return {
    hour: Number(p.find((x) => x.type === "hour")?.value ?? 0),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      p.find((x) => x.type === "weekday")?.value ?? "Sun",
    ),
  };
};

/** Walk-in guests (میهمانان آزاد): visits without a booking, by hour and weekday. */
export async function walkIns(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "orders.view");
  const tz = ctx.restaurant.timezone;
  const list = await visits(db, ctx.restaurant.id, r);
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, walkIn: 0, booked: 0 }));
  const weekdays = Array.from({ length: 7 }, (_, d) => ({ weekday: d, walkIn: 0, booked: 0 }));
  for (const v of list) {
    const p = localParts(v.at, tz);
    const k = v.booked ? "booked" : "walkIn";
    hours[p.hour]![k]++;
    weekdays[p.weekday]![k]++;
  }
  const walk = list.filter((v) => !v.booked);
  return {
    visits: list.length,
    walkIns: walk.length,
    booked: list.length - walk.length,
    walkInCovers: walk.reduce((s, v) => s + v.covers, 0),
    bookedCovers: list.filter((v) => v.booked).reduce((s, v) => s + v.covers, 0),
    share: list.length ? walk.length / list.length : 0,
    hours: hours.filter((h) => h.walkIn || h.booked),
    weekdays,
  };
}

/**
 * Table occupancy (درصد اشغال): per hour of the day, the share of the dining tables in use;
 * per day, visits, turnover (visits per table) and average time at the table.
 */
export async function occupancy(db: DbOrTx, ctx: RestaurantContext, r: Range, hour = 0) {
  assertCan(ctx, "orders.view");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const [[tables], list] = await Promise.all([
    db
      .select({ n: count(), seats: sum(diningTables.capacity) })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, rid),
          eq(diningTables.kind, "table"),
          isNull(diningTables.deletedAt),
        ),
      ),
    visits(db, rid, r),
  ]);
  const nTables = tables?.n ?? 0;
  const dayCount = Math.max(1, Math.round((r.to.getTime() - r.from.getTime()) / DAY_MS));
  const minutes = new Array<number>(24).fill(0);
  const byDay = new Map<string, { day: string; visits: number; covers: number; minutes: number }>();
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(d.getTime() - hour * 3_600_000));
  for (const v of list) {
    // Minutes of the visit in each local hour.
    for (let t = v.at.getTime(); t < v.end.getTime();) {
      const next = Math.min(v.end.getTime(), Math.floor(t / 3_600_000) * 3_600_000 + 3_600_000);
      minutes[localParts(new Date(t), tz).hour]! += (next - t) / 60_000;
      t = next;
    }
    const k = dayKey(v.at);
    const d = byDay.get(k) ?? { day: k, visits: 0, covers: 0, minutes: 0 };
    d.visits++;
    d.covers += v.covers;
    d.minutes += (v.end.getTime() - v.at.getTime()) / 60_000;
    byDay.set(k, d);
  }
  const cap = nTables * 60 * dayCount;
  const totalMinutes = list.reduce((s, v) => s + (v.end.getTime() - v.at.getTime()) / 60_000, 0);
  return {
    tables: nTables,
    seats: tables?.seats ?? 0,
    visits: list.length,
    covers: list.reduce((s, v) => s + v.covers, 0),
    avgMinutes: list.length ? Math.round(totalMinutes / list.length) : 0,
    turnover: nTables ? list.length / nTables / dayCount : 0,
    hours: minutes.map((m, h) => ({ hour: h, pct: cap ? Math.min(1, m / cap) : 0 })).filter((x) => x.pct > 0),
    days: [...byDay.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => ({
        ...d,
        turnover: nTables ? d.visits / nTables : 0,
        avgMinutes: d.visits ? Math.round(d.minutes / d.visits) : 0,
      })),
  };
}

// ─── Sales per person (گزارش فروش نفرات) ──────────────────────────────────────

/**
 * Sales per team member (who rang the order up) and the money each collected, with the guests'
 * own orders (QR, online, kiosk) apart; covers and the average spend per guest.
 */
export async function salesPerPerson(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const [sold, collected, cancelled, covers] = await Promise.all([
    db
      .select({
        userId: orders.createdByUserId,
        name: users.fullName,
        orders: count(),
        discountCents: sum(orders.discountCents),
        totalCents: sum(orders.totalCents),
      })
      .from(orders)
      .leftJoin(users, eq(users.id, orders.createdByUserId))
      .where(salesWhere(rid, r))
      .groupBy(orders.createdByUserId, users.fullName),
    db
      .select({
        userId: payments.recordedByUserId,
        provider: payments.provider,
        amountCents: sum(sql`${payments.amountCents} - ${payments.refundedCents}`),
      })
      .from(payments)
      .where(paidWhere(rid, r))
      .groupBy(payments.recordedByUserId, payments.provider),
    db
      .select({ userId: orders.createdByUserId, n: count() })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, rid),
          eq(orders.status, "cancelled"),
          gte(orders.placedAt, r.from),
          lt(orders.placedAt, r.to),
        ),
      )
      .groupBy(orders.createdByUserId),
    db
      .select({ n: count() })
      .from(sessionParticipants)
      .innerJoin(tableSessions, eq(tableSessions.id, sessionParticipants.tableSessionId))
      .where(
        and(
          eq(sessionParticipants.restaurantId, rid),
          gte(tableSessions.openedAt, r.from),
          lt(tableSessions.openedAt, r.to),
        ),
      ),
  ]);
  const key = (id: string | null) => id ?? "guests";
  const people = new Map<
    string,
    {
      id: string;
      name: string | null;
      orders: number;
      totalCents: number;
      discountCents: number;
      avgCents: number;
      cancelled: number;
      cash: number;
      card: number;
      online: number;
      account: number;
      other: number;
    }
  >();
  const get = (id: string | null, name: string | null = null) => {
    const k = key(id);
    const cur = people.get(k) ?? {
      id: k,
      name,
      orders: 0,
      totalCents: 0,
      discountCents: 0,
      avgCents: 0,
      cancelled: 0,
      cash: 0,
      card: 0,
      online: 0,
      account: 0,
      other: 0,
    };
    if (name && !cur.name) cur.name = name;
    people.set(k, cur);
    return cur;
  };
  for (const s of sold) {
    const p = get(s.userId, s.name);
    p.orders += s.orders;
    p.totalCents += s.totalCents;
    p.discountCents += s.discountCents;
  }
  for (const c of collected) get(c.userId)[methodOf(c.provider)] += c.amountCents;
  for (const c of cancelled) get(c.userId).cancelled += c.n;
  const missing = [...people.values()].filter((p) => !p.name && p.id !== "guests").map((p) => p.id);
  if (missing.length) {
    const names = await db
      .select({ id: users.id, name: users.fullName })
      .from(users)
      .where(inArray(users.id, missing));
    for (const u of names) people.get(u.id)!.name = u.name;
  }
  const list = [...people.values()]
    .map((p) => ({ ...p, avgCents: p.orders ? Math.round(p.totalCents / p.orders) : 0 }))
    .sort((a, b) => b.totalCents - a.totalCents);
  const total = list.reduce((s, p) => s + p.totalCents, 0);
  const guests = covers[0]?.n ?? 0;
  return { people: list, total, covers: guests, perCoverCents: guests ? Math.round(total / guests) : 0 };
}

// ─── Sales invoices (نمایش فاکتور فروش) ────────────────────────────────────────

export async function invoicesInPeriod(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "invoices.view");
  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      issuedAt: invoices.issuedAt,
      totalCents: invoices.totalCents,
      taxCents: invoices.taxCents,
      token: invoices.publicToken,
      buyer: sql<string | null>`${invoices.snapshot}->'buyer'->>'name'`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.restaurantId, ctx.restaurant.id),
        gte(invoices.issuedAt, r.from),
        lt(invoices.issuedAt, r.to),
      ),
    )
    .orderBy(desc(invoices.issuedAt))
    .limit(1000);
  return {
    rows,
    totals: {
      count: rows.length,
      totalCents: rows.reduce((s, x) => s + x.totalCents, 0),
      taxCents: rows.reduce((s, x) => s + x.taxCents, 0),
      named: rows.filter((x) => x.buyer).length,
    },
  };
}

// ─── Charts (گزارش نموداری) ────────────────────────────────────────────────────

/** Revenue per weekday (average per day of that weekday in the period). */
export async function weekdaySales(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "accounting.manage");
  const tz = ctx.restaurant.timezone;
  const rows = await db
    .select({
      weekday: n(sql<number>`extract(dow from ${orders.placedAt} at time zone ${tz})::int`),
      days: n(sql<number>`count(distinct (${orders.placedAt} at time zone ${tz})::date)`),
      orders: count(),
      totalCents: sum(orders.totalCents),
    })
    .from(orders)
    .where(salesWhere(ctx.restaurant.id, r))
    .groupBy(sql`1`);
  return Array.from({ length: 7 }, (_, d) => {
    const x = rows.find((y) => y.weekday === d);
    return {
      weekday: d,
      orders: x?.orders ?? 0,
      totalCents: x?.totalCents ?? 0,
      avgCents: x?.days ? Math.round(x.totalCents / x.days) : 0,
    };
  });
}
