import { and, eq, gte, inArray, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import {
  auditLogs,
  orders,
  products,
  recipeItems,
  refunds,
  stockItems,
  stockMovements,
  users,
} from "@/server/db/schema";
import { productCosts } from "@/server/modules/inventory/service";
import { getReportSettings } from "@/server/modules/reports/center";
import type { Range } from "@/server/modules/reports/service";
import { notifyTeam } from "@/server/modules/team/sections";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { foodCostReview, forecastNeed, reviewStaff, type StaffStats } from "./analysis";

const num = (s: ReturnType<typeof sql<number>>) => s.mapWith(Number);
const DAY_MS = 86_400_000;

// ─── Food cost ───────────────────────────────────────────────────────────────

/** Every dish with a recipe: its cost, its food-cost share and, above the target, the price to set. */
export async function foodCosts(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "inventory.manage");
  const rid = ctx.restaurant.id;
  const [costs, list, settings] = await Promise.all([
    productCosts(db, rid),
    db
      .select({ productId: products.id, name: products.name, priceCents: products.priceCents })
      .from(products)
      .where(and(eq(products.restaurantId, rid), isNull(products.deletedAt))),
    getReportSettings(db, rid),
  ]);
  const rows = list
    .filter((p) => costs.has(p.productId))
    .map((p) => ({ ...p, costCents: costs.get(p.productId)! }));
  return { target: settings.foodCostTargetPct, rows: foodCostReview(rows, settings.foodCostTargetPct) };
}

/**
 * After goods are received: an ingredient that got at least 5 % dearer tells the team which dishes
 * now exceed the food-cost target, with the price to set (the notification opens the list).
 */
export async function alertCostRises(
  db: DbOrTx,
  restaurantId: string,
  changes: { stockItemId: string; name: string; before: number; after: number }[],
) {
  const rises = changes.filter((c) => c.before > 0 && c.after >= c.before * 1.05);
  if (!rises.length) return 0;
  const { foodCostTargetPct: target } = await getReportSettings(db, restaurantId);
  const costs = await productCosts(db, restaurantId);
  let sent = 0;
  for (const r of rises) {
    const using = await db
      .select({ id: products.id, priceCents: products.priceCents })
      .from(recipeItems)
      .innerJoin(products, eq(products.id, recipeItems.productId))
      .where(
        and(
          eq(recipeItems.restaurantId, restaurantId),
          eq(recipeItems.stockItemId, r.stockItemId),
          isNull(products.deletedAt),
        ),
      );
    const over = using.filter(
      (p) => p.priceCents > 0 && (costs.get(p.id) ?? 0) / p.priceCents > target / 100,
    );
    if (!over.length) continue;
    await notifyTeam(db, {
      restaurantId,
      type: "cost.rise",
      payload: {
        name: r.name,
        percent: Math.round(((r.after - r.before) / r.before) * 100),
        count: over.length,
      },
    });
    sent++;
  }
  return sent;
}

// ─── Purchase plan ───────────────────────────────────────────────────────────

const WEEKS = 4;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** What to buy for the coming days, from each ingredient's usage on the same weekdays. */
export async function purchasePlan(
  db: DbOrTx,
  ctx: RestaurantContext,
  opts: { days: number; factor: number; now?: Date },
) {
  assertCan(ctx, "inventory.manage");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - WEEKS * 7 * DAY_MS);
  const [items, usage] = await Promise.all([
    db
      .select()
      .from(stockItems)
      .where(
        and(eq(stockItems.restaurantId, rid), isNull(stockItems.deletedAt), eq(stockItems.isActive, true)),
      ),
    db
      .select({
        stockItemId: stockMovements.stockItemId,
        dow: num(sql<number>`extract(dow from ${stockMovements.createdAt} at time zone ${tz})::int`),
        used: num(sql<number>`-sum(${stockMovements.quantity})`),
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.restaurantId, rid),
          inArray(stockMovements.kind, ["sale", "sale_cancel", "waste"]),
          gte(stockMovements.createdAt, since),
        ),
      )
      .groupBy(stockMovements.stockItemId, sql`2`),
  ]);
  const startWeekday = WEEKDAYS.indexOf(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(
      new Date(now.getTime() + DAY_MS),
    ),
  );
  const rows = items.map((it) => {
    const byDow = Array.from({ length: 7 }, (_, d) =>
      Math.max(0, usage.find((u) => u.stockItemId === it.id && u.dow === d)?.used ?? 0),
    );
    const f = forecastNeed({
      usageByWeekday: byDow,
      weeks: WEEKS,
      startWeekday,
      days: opts.days,
      factor: opts.factor,
      inStock: it.quantity,
      threshold: it.lowStockThreshold,
    });
    return {
      id: it.id,
      name: it.name,
      unit: it.unit,
      quantity: it.quantity,
      avgCostCents: it.avgCostCents,
      ...f,
      costCents: Math.round(f.toBuy * it.avgCostCents),
    };
  });
  rows.sort(
    (a, b) => (b.toBuy > 0 ? 1 : 0) - (a.toBuy > 0 ? 1 : 0) || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9),
  );
  return {
    rows,
    totalCents: rows.reduce((s, r) => s + r.costCents, 0),
    hasHistory: usage.length > 0,
  };
}

// ─── Staff anomalies ─────────────────────────────────────────────────────────

/** Cancellations, discounts, refunds and cash differences per person over the period. */
export async function staffAnomalies(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "audit.view");
  const toleranceCents = cashTolerance(ctx.restaurant.currency);
  return { rows: await staffAnomaliesFor(db, ctx.restaurant, r), toleranceCents };
}

/** The same review for a restaurant, without a signed-in person (the evening report). */
export async function staffAnomaliesFor(db: DbOrTx, restaurant: { id: string; currency: string }, r: Range) {
  const rid = restaurant.id;
  const period = (col: Parameters<typeof gte>[0]) => and(gte(col, r.from), lt(col, r.to));
  const [sales, cancels, refundRows, shifts] = await Promise.all([
    db
      .select({
        userId: orders.createdByUserId,
        orders: num(sql<number>`count(*)`),
        salesCents: num(sql<number>`coalesce(sum(${orders.totalCents}), 0)`),
        discountCents: num(sql<number>`coalesce(sum(${orders.discountCents}), 0)`),
      })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, rid),
          isNotNull(orders.createdByUserId),
          notInArray(orders.status, ["cancelled", "pending_payment"]),
          period(orders.placedAt),
        ),
      )
      .groupBy(orders.createdByUserId),
    db
      .select({
        userId: auditLogs.actorUserId,
        n: num(sql<number>`count(*)`),
        cents: num(sql<number>`coalesce(sum((${auditLogs.metadata}->>'totalCents')::bigint), 0)`),
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.restaurantId, rid),
          eq(auditLogs.action, "order.cancelled"),
          isNotNull(auditLogs.actorUserId),
          period(auditLogs.createdAt),
        ),
      )
      .groupBy(auditLogs.actorUserId),
    db
      .select({
        userId: refunds.createdByUserId,
        cents: num(sql<number>`coalesce(sum(${refunds.amountCents}), 0)`),
      })
      .from(refunds)
      .where(
        and(eq(refunds.restaurantId, rid), isNotNull(refunds.createdByUserId), period(refunds.createdAt)),
      )
      .groupBy(refunds.createdByUserId),
    db
      .select({
        userId: auditLogs.actorUserId,
        cents: num(sql<number>`coalesce(sum((${auditLogs.metadata}->>'difference')::bigint), 0)`),
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.restaurantId, rid),
          eq(auditLogs.action, "cash.shift_closed"),
          isNotNull(auditLogs.actorUserId),
          period(auditLogs.createdAt),
        ),
      )
      .groupBy(auditLogs.actorUserId),
  ]);
  const ids = [
    ...new Set([...sales, ...cancels, ...refundRows, ...shifts].map((x) => x.userId).filter(Boolean)),
  ] as string[];
  if (!ids.length) return [];
  const names = await db
    .select({ id: users.id, name: users.fullName })
    .from(users)
    .where(inArray(users.id, ids));
  const stats: StaffStats[] = ids.map((id) => {
    const s = sales.find((x) => x.userId === id);
    const c = cancels.find((x) => x.userId === id);
    return {
      userId: id,
      name: names.find((n) => n.id === id)?.name ?? "—",
      orders: s?.orders ?? 0,
      salesCents: s?.salesCents ?? 0,
      discountCents: s?.discountCents ?? 0,
      cancellations: c?.n ?? 0,
      cancelledCents: c?.cents ?? 0,
      refundCents: refundRows.find((x) => x.userId === id)?.cents ?? 0,
      cashDifferenceCents: shifts.find((x) => x.userId === id)?.cents ?? 0,
    };
  });
  return reviewStaff(stats, cashTolerance(restaurant.currency));
}

/** Cash shortfall worth a look: 100 000 rials (10 000 tomans), 5 € elsewhere. */
export const cashTolerance = (currency: string) => (currency === "IRR" ? 10_000_000 : 500);
