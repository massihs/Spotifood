import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { categories, kitchenStations, orderItems, orders } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";

export const STATION_COLORS = [
  "orange",
  "rose",
  "sky",
  "emerald",
  "amber",
  "violet",
  "teal",
  "fuchsia",
] as const;

const live = (rid: string) => and(eq(kitchenStations.restaurantId, rid), isNull(kitchenStations.deletedAt));

/** Stations with the categories they prepare. */
export async function listStations(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "orders.view");
  const [stations, cats] = await Promise.all([
    db
      .select()
      .from(kitchenStations)
      .where(live(ctx.restaurant.id))
      .orderBy(asc(kitchenStations.sortOrder), asc(kitchenStations.createdAt)),
    db
      .select({ id: categories.id, name: categories.name, stationId: categories.stationId })
      .from(categories)
      .where(and(eq(categories.restaurantId, ctx.restaurant.id), isNull(categories.deletedAt)))
      .orderBy(asc(categories.sortOrder)),
  ]);
  return { stations, categories: cats };
}

export const stationSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.enum(STATION_COLORS).default("orange"),
  categoryIds: z.array(z.uuid()).max(200).default([]),
});

/** Creates or updates a station and (re)assigns its categories. */
export async function saveStation(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: z.input<typeof stationSchema>,
) {
  assertCan(ctx, "menu.manage");
  const input = stationSchema.parse(raw);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    let stationId = id;
    if (id) {
      if (!isUuid(id)) throw notFound();
      const res = await tx
        .update(kitchenStations)
        .set({ name: input.name, color: input.color })
        .where(and(eq(kitchenStations.id, id), live(rid)))
        .returning({ id: kitchenStations.id });
      if (!res.length) throw notFound();
    } else {
      const [s] = await tx
        .insert(kitchenStations)
        .values({ restaurantId: rid, name: input.name, color: input.color })
        .returning({ id: kitchenStations.id });
      stationId = s!.id;
    }
    await tx
      .update(categories)
      .set({ stationId: null })
      .where(and(eq(categories.restaurantId, rid), eq(categories.stationId, stationId!)));
    if (input.categoryIds.length)
      await tx
        .update(categories)
        .set({ stationId })
        .where(and(eq(categories.restaurantId, rid), inArray(categories.id, input.categoryIds)));
    await recordAudit(tx, {
      action: id ? "station.updated" : "station.created",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "kitchen_station",
      entityId: stationId!,
      metadata: { name: input.name, categories: input.categoryIds.length },
    });
    return stationId!;
  });
}

export async function deleteStation(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "menu.manage");
  if (!isUuid(id)) throw notFound();
  await db.transaction(async (tx) => {
    await tx
      .update(kitchenStations)
      .set({ deletedAt: new Date() })
      .where(and(eq(kitchenStations.id, id), live(ctx.restaurant.id)));
    await tx
      .update(categories)
      .set({ stationId: null })
      .where(and(eq(categories.restaurantId, ctx.restaurant.id), eq(categories.stationId, id)));
  });
}

/** A kitchen ticket: the order with only this station's items (all items when no station). */
export async function getTicket(
  db: DbOrTx,
  ctx: RestaurantContext,
  orderId: string,
  stationId: string | null,
) {
  assertCan(ctx, "orders.view");
  if (!isUuid(orderId)) throw notFound();
  const [o] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, ctx.restaurant.id)));
  if (!o) throw notFound();
  const items = await db
    .select({
      id: orderItems.id,
      quantity: orderItems.quantity,
      productName: orderItems.productName,
      options: orderItems.options,
      note: orderItems.note,
      stationId: categories.stationId,
    })
    .from(orderItems)
    .leftJoin(categories, eq(categories.id, orderItems.categoryId))
    .where(eq(orderItems.orderId, o.id))
    .orderBy(asc(orderItems.createdAt));
  let station: { name: string } | null = null;
  if (stationId && isUuid(stationId)) {
    const [s] = await db
      .select({ name: kitchenStations.name })
      .from(kitchenStations)
      .where(and(eq(kitchenStations.id, stationId), live(ctx.restaurant.id)));
    station = s ?? null;
  }
  return {
    order: o,
    station,
    items: station ? items.filter((i) => i.stationId === stationId) : items,
  };
}
