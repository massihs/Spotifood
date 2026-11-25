import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { kitchenStations, orderItems, orders } from "@/server/db/schema";
import { conflict, isAppError, notFound } from "@/server/errors";
import { emit, topics } from "@/server/infra/realtime";
import { isUuid } from "@/lib/ids";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { notifyTeam } from "@/server/modules/team/sections";
import { updateOrderStatus } from "@/server/modules/orders/service";

/**
 * Each station moves its own part of an order: the bar can have the drinks ready while the
 * kitchen is still cooking. The order follows: "preparing" as soon as one station starts, "ready"
 * only when every station is done. When one station finishes before the others, the waiters are
 * told what can already go out ("Bar ready · table 4").
 */

export type StationStep = "preparing" | "ready";

export async function advanceStation(
  db: Database,
  ctx: RestaurantContext,
  orderId: string,
  stationId: string,
  to: StationStep,
) {
  assertCan(ctx, "orders.update_status");
  if (!isUuid(orderId) || !isUuid(stationId)) throw notFound();
  const rid = ctx.restaurant.id;
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, rid)));
  if (!order) throw notFound();
  if (!["received", "accepted", "preparing"].includes(order.status)) throw conflict("status_changed");
  const [station] = await db
    .select({ name: kitchenStations.name })
    .from(kitchenStations)
    .where(and(eq(kitchenStations.id, stationId), eq(kitchenStations.restaurantId, rid)));
  if (!station) throw notFound();

  const now = new Date();
  const changed = await db
    .update(orderItems)
    .set({
      startedAt: sql`coalesce(${orderItems.startedAt}, ${now})`,
      ...(to === "ready" ? { readyAt: sql`coalesce(${orderItems.readyAt}, ${now})` } : {}),
    })
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.stationId, stationId)))
    .returning({ id: orderItems.id });
  if (!changed.length) throw notFound("no_lines_for_station");

  // Where the whole order stands now.
  const [left] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.readyAt)));
  const allReady = (left?.n ?? 0) === 0;
  // Two stations finishing at the same moment both try to move the order: the second one finds
  // it already moved, which is fine, not an error.
  const moveOrder = async (to: "preparing" | "ready") => {
    try {
      await updateOrderStatus(db, ctx, orderId, to);
    } catch (e) {
      if (!(isAppError(e) && e.code === "CONFLICT")) throw e;
    }
  };

  if (allReady) {
    // The last station finished: the order is ready (the usual "ready" notifications go out).
    await moveOrder("ready");
    return { orderReady: true };
  }
  if (order.status === "received" || order.status === "accepted") await moveOrder("preparing");
  else
    await emit(db, {
      topic: topics.restaurant(rid),
      type: "order.updated",
      data: { orderId, status: order.status, tableId: order.tableId },
    });
  if (to === "ready")
    await notifyTeam(
      db,
      {
        restaurantId: rid,
        type: "station.ready",
        payload: {
          orderId,
          number: order.number,
          tableLabel: order.tableLabel,
          name: station.name,
          ...(order.placeKind === "room" ? { place: "room" } : {}),
        },
      },
      { orderId },
    );
  return { orderReady: false };
}
