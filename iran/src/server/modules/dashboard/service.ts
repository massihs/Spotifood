import { and, count, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import {
  categories,
  diningTables,
  orders,
  payments,
  products,
  restaurantMembers,
  restaurants,
  tableSessions,
} from "@/server/db/schema";
import { assertCan, type RestaurantContext } from "@/server/tenancy";

/** Counts used by the onboarding checklist. All queries are scoped to ctx.restaurant.id. */
export async function getSetupOverview(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const rid = ctx.restaurant.id;

  const [[t], [c], [p], [m], [r]] = await Promise.all([
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
      .select({ phone: restaurants.phone, address: restaurants.addressLine1 })
      .from(restaurants)
      .where(eq(restaurants.id, rid)),
  ]);

  return {
    tables: t?.n ?? 0,
    categories: c?.n ?? 0,
    products: p?.n ?? 0,
    members: m?.n ?? 0,
    profileComplete: Boolean(r?.phone && r?.address),
  };
}

/**
 * Today's activity (restaurant time zone): orders, revenue collected, open tables, orders in the
 * kitchen right now, and the last 7 days of revenue for the trend line.
 */
export async function getTodayStats(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const dayStart = sql`(date_trunc('day', now() at time zone ${tz}) at time zone ${tz})`;

  const [[o], [p], [s], [k], days] = await Promise.all([
    db
      .select({ n: count() })
      .from(orders)
      .where(
        and(eq(orders.restaurantId, rid), ne(orders.status, "cancelled"), gte(orders.placedAt, dayStart)),
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
      .where(and(eq(orders.restaurantId, rid), inArray(orders.status, ["received", "accepted", "preparing"]))),
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
          gte(payments.succeededAt, sql`${dayStart} - interval '6 days'`),
        ),
      )
      .groupBy(sql`1`),
  ]);

  return {
    ordersToday: o?.n ?? 0,
    revenueTodayCents: Number(p?.total ?? 0),
    openTables: s?.n ?? 0,
    inKitchen: k?.n ?? 0,
    revenueByDay: days.map((d) => ({ day: d.day, cents: Number(d.total) })),
    asOf: new Date(),
  };
}
