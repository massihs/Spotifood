import { and, asc, count, desc, eq, gte, inArray, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import {
  categories,
  diningTables,
  orderItems,
  orders,
  payments,
  products,
  restaurantMembers,
  reservations,
  restaurantSettings,
  restaurants,
  tableSessions,
} from "@/server/db/schema";
import { assertCan, type RestaurantContext } from "@/server/tenancy";

/** Counts used by the onboarding checklist. All queries are scoped to ctx.restaurant.id. */
export async function getSetupOverview(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const rid = ctx.restaurant.id;

  const [[t], [c], [p], [m], [r], [pay], [paid]] = await Promise.all([
    db
      .select({ n: count() })
      .from(diningTables)
      .where(and(eq(diningTables.restaurantId, rid), isNull(diningTables.deletedAt))),
    db
      .select({ n: count() })
      .from(categories)
      .where(and(eq(categories.restaurantId, rid), isNull(categories.deletedAt))),
    db
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.restaurantId, rid), isNull(products.deletedAt))),
    db
      .select({ n: count() })
      .from(restaurantMembers)
      .where(and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.status, "active"))),
    db
      .select({
        phone: restaurants.phone,
        address: restaurants.addressLine1,
        logo: restaurants.logoKey,
        orders:
          sql<number>`(select count(*) from orders o where o.restaurant_id = ${restaurants.id})`.mapWith(
            Number,
          ),
      })
      .from(restaurants)
      .where(eq(restaurants.id, rid)),
    db
      .select({ online: restaurantSettings.onlinePaymentEnabled })
      .from(restaurantSettings)
      .where(eq(restaurantSettings.restaurantId, rid)),
    db
      .select({ n: count() })
      .from(payments)
      .where(and(eq(payments.restaurantId, rid), eq(payments.status, "succeeded"))),
  ]);

  return {
    tables: t?.n ?? 0,
    categories: c?.n ?? 0,
    products: p?.n ?? 0,
    members: m?.n ?? 0,
    profileComplete: Boolean(r?.phone && r?.address),
    hasLogo: Boolean(r?.logo),
    hasOrders: (r?.orders ?? 0) > 0,
    // Payments count as set up once online payment is on, or once the restaurant has collected.
    paymentsReady: Boolean(pay?.online) || (paid?.n ?? 0) > 0,
  };
}

/**
 * Today's activity (restaurant time zone): orders, revenue collected, open tables, orders in the
 * kitchen right now, and the last 8 days of revenue (the trend line, and the same day last week).
 */
export async function getTodayStats(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const dayStart = sql`(date_trunc('day', now() at time zone ${tz}) at time zone ${tz})`;

  const [[o], [p], [s], [k], days] = await Promise.all([
    db
      .select({ n: count(), total: sql<string>`coalesce(sum(${orders.totalCents}), 0)` })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, rid),
          notInArray(orders.status, ["cancelled", "pending_payment"]),
          gte(orders.placedAt, dayStart),
        ),
      ),
    db
      .select({ total: sql<string>`coalesce(sum(${payments.amountCents} - ${payments.refundedCents}), 0)` })
      .from(payments)
      .where(
        and(
          eq(payments.restaurantId, rid),
          inArray(payments.status, ["succeeded", "partially_refunded"]),
          gte(payments.succeededAt, dayStart),
        ),
      ),
    db
      .select({ n: count() })
      .from(tableSessions)
      .where(and(eq(tableSessions.restaurantId, rid), eq(tableSessions.status, "open"))),
    db
      .select({ n: count() })
      .from(orders)
      .where(
        and(eq(orders.restaurantId, rid), inArray(orders.status, ["received", "accepted", "preparing"])),
      ),
    db
      .select({
        day: sql<string>`to_char(${payments.succeededAt} at time zone ${tz}, 'YYYY-MM-DD')`,
        total: sql<string>`sum(${payments.amountCents} - ${payments.refundedCents})`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.restaurantId, rid),
          inArray(payments.status, ["succeeded", "partially_refunded"]),
          gte(payments.succeededAt, sql`${dayStart} - interval '7 days'`),
        ),
      )
      .groupBy(sql`1`),
  ]);

  return {
    ordersToday: o?.n ?? 0,
    averageTicketCents: o?.n ? Math.round(Number(o.total) / o.n) : 0,
    revenueTodayCents: Number(p?.total ?? 0),
    openTables: s?.n ?? 0,
    inKitchen: k?.n ?? 0,
    revenueByDay: days.map((d) => ({ day: d.day, cents: Number(d.total) })),
    asOf: new Date(),
  };
}

/**
 * What needs attention now: the oldest orders still in the works, today's next bookings, and the
 * week's best sellers. Each list is short: the overview links to the full screen.
 */
export async function getOverviewLive(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const dayStart = sql`(date_trunc('day', now() at time zone ${tz}) at time zone ${tz})`;
  const canOrders = ctx.permissions.has("orders.view");

  const [active, unpaid, bookings, [day], top] = await Promise.all([
    canOrders
      ? db
          .select({
            id: orders.id,
            number: orders.number,
            status: orders.status,
            tableLabel: orders.tableLabel,
            channel: orders.channel,
            totalCents: orders.totalCents,
            placedAt: orders.placedAt,
          })
          .from(orders)
          .where(
            and(
              eq(orders.restaurantId, rid),
              inArray(orders.status, ["pending_payment", "received", "accepted", "preparing", "ready"]),
            ),
          )
          .orderBy(asc(orders.placedAt))
          .limit(6)
      : [],
    canOrders
      ? db
          .select({ total: sql<string>`coalesce(sum(${orders.totalCents}), 0)` })
          .from(orders)
          .where(
            and(
              eq(orders.restaurantId, rid),
              ne(orders.status, "cancelled"),
              ne(orders.paymentStatus, "paid"),
              gte(orders.placedAt, dayStart),
            ),
          )
      : [],
    canOrders
      ? db
          .select({
            id: reservations.id,
            name: reservations.name,
            partySize: reservations.partySize,
            startsAt: reservations.startsAt,
            status: reservations.status,
          })
          .from(reservations)
          .where(
            and(
              eq(reservations.restaurantId, rid),
              eq(reservations.kind, "booking"),
              inArray(reservations.status, ["pending", "confirmed", "notified"]),
              gte(reservations.startsAt, sql`now() - interval '30 minutes'`),
              lt(reservations.startsAt, sql`${dayStart} + interval '1 day'`),
            ),
          )
          .orderBy(asc(reservations.startsAt))
          .limit(5)
      : [],
    db
      .select({
        bookings: count(),
        covers: sql<string>`coalesce(sum(${reservations.partySize}), 0)`,
        pending: sql<string>`count(*) filter (where ${reservations.status} = 'pending')`,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, rid),
          eq(reservations.kind, "booking"),
          notInArray(reservations.status, ["cancelled", "no_show"]),
          gte(reservations.startsAt, dayStart),
          lt(reservations.startsAt, sql`${dayStart} + interval '1 day'`),
        ),
      ),
    db
      .select({
        name: orderItems.productName,
        quantity: sql<string>`sum(${orderItems.quantity})`,
        cents: sql<string>`sum(${orderItems.lineTotalCents})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.restaurantId, rid),
          ne(orders.status, "cancelled"),
          gte(orders.placedAt, sql`${dayStart} - interval '6 days'`),
        ),
      )
      .groupBy(orderItems.productName)
      .orderBy(desc(sql`sum(${orderItems.quantity})`))
      .limit(5),
  ]);

  return {
    active,
    unpaidCents: Number(unpaid[0]?.total ?? 0),
    bookings,
    bookingsToday: day?.bookings ?? 0,
    coversToday: Number(day?.covers ?? 0),
    pendingBookings: Number(day?.pending ?? 0),
    top: top.map((r) => ({ name: r.name, quantity: Number(r.quantity), cents: Number(r.cents) })),
  };
}

export type Channel = "dine_in" | "takeaway" | "delivery";

/**
 * The day's rhythm for the overview: sales per hour today and on the same weekday last week, the
 * comparison at the same time of day (a morning is not judged against last week's whole day), the
 * mix of channels and how many orders wait at each step. Online orders still waiting for their
 * payment are not sales yet.
 */
export async function getTodayPulse(db: DbOrTx, ctx: RestaurantContext, asOf = new Date()) {
  assertCan(ctx, "restaurant.view");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const at = sql`${asOf.toISOString()}::timestamptz`;
  const dayStart = sql`(date_trunc('day', ${at} at time zone ${tz}) at time zone ${tz})`;
  const weekAgo = sql`(${dayStart} - interval '7 days')`;
  const sales = and(
    eq(orders.restaurantId, rid),
    notInArray(orders.status, ["cancelled", "pending_payment"]),
  );

  const [hours, [orderSoFar], [paidSoFar], steps] = await Promise.all([
    db
      .select({
        today: sql<boolean>`${orders.placedAt} >= ${dayStart}`,
        hour: sql<number>`extract(hour from ${orders.placedAt} at time zone ${tz})::int`,
        channel: orders.channel,
        n: count(),
        cents: sql<string>`coalesce(sum(${orders.totalCents}), 0)`,
      })
      .from(orders)
      .where(
        and(
          sales,
          or(
            and(gte(orders.placedAt, dayStart), lt(orders.placedAt, sql`${dayStart} + interval '1 day'`)),
            and(gte(orders.placedAt, weekAgo), lt(orders.placedAt, sql`${weekAgo} + interval '1 day'`)),
          ),
        ),
      )
      .groupBy(sql`1`, sql`2`, orders.channel),
    db
      .select({ n: count(), cents: sql<string>`coalesce(sum(${orders.totalCents}), 0)` })
      .from(orders)
      .where(and(sales, gte(orders.placedAt, weekAgo), lt(orders.placedAt, sql`${at} - interval '7 days'`))),
    db
      .select({ cents: sql<string>`coalesce(sum(${payments.amountCents} - ${payments.refundedCents}), 0)` })
      .from(payments)
      .where(
        and(
          eq(payments.restaurantId, rid),
          inArray(payments.status, ["succeeded", "partially_refunded"]),
          gte(payments.succeededAt, weekAgo),
          lt(payments.succeededAt, sql`${at} - interval '7 days'`),
        ),
      ),
    db
      .select({ status: orders.status, n: count() })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, rid),
          inArray(orders.status, ["received", "accepted", "preparing", "ready"]),
        ),
      )
      .groupBy(orders.status),
  ]);

  const today = Array.from({ length: 24 }, () => 0);
  const lastWeek = Array.from({ length: 24 }, () => 0);
  const channels = new Map<Channel, { orders: number; cents: number }>();
  for (const r of hours) {
    const cents = Number(r.cents);
    (r.today ? today : lastWeek)[r.hour] = ((r.today ? today : lastWeek)[r.hour] ?? 0) + cents;
    if (!r.today) continue;
    const c = channels.get(r.channel as Channel) ?? { orders: 0, cents: 0 };
    channels.set(r.channel as Channel, { orders: c.orders + r.n, cents: c.cents + cents });
  }
  const stepCount = (...st: string[]) =>
    steps.filter((x) => st.includes(x.status)).reduce((n, x) => n + x.n, 0);
  return {
    /** Sales (order totals) per local hour, 0–23. */
    hourly: { today, lastWeek },
    /** Same weekday last week, up to the same time of day. */
    lastWeekSoFar: {
      orders: orderSoFar?.n ?? 0,
      salesCents: Number(orderSoFar?.cents ?? 0),
      revenueCents: Number(paidSoFar?.cents ?? 0),
    },
    channels: (["dine_in", "takeaway", "delivery"] as const)
      .map((channel) => ({ channel, ...(channels.get(channel) ?? { orders: 0, cents: 0 }) }))
      .filter((c) => c.orders > 0),
    steps: {
      received: stepCount("received"),
      preparing: stepCount("accepted", "preparing"),
      ready: stepCount("ready"),
    },
  };
}
