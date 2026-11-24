import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { notifications, orderItems, orders } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import { saveStation, setDefaultStation } from "@/server/modules/kitchen/stations";
import { advanceStation } from "@/server/modules/kitchen/progress";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("per-station progress", () => {
  it("each station moves its part; the order is ready when all are done", async () => {
    const { ctx } = await createOwnerWithRestaurant("Stations");
    const kebabs = await createCategory(db, ctx, { name: "Kebab" });
    const drinks = await createCategory(db, ctx, { name: "Drinks" });
    const desserts = await createCategory(db, ctx, { name: "Desserts" });
    const k = await createProduct(db, ctx, { categoryId: kebabs.id, name: "Koobideh", priceCents: 1500 });
    const d = await createProduct(db, ctx, { categoryId: drinks.id, name: "Doogh", priceCents: 300 });
    const s = await createProduct(db, ctx, { categoryId: desserts.id, name: "Faloodeh", priceCents: 400 });
    const kitchen = await saveStation(db, ctx, null, { name: "Kitchen", categoryIds: [kebabs.id] });
    const bar = await saveStation(db, ctx, null, { name: "Bar", categoryIds: [drinks.id] });
    // Desserts have no station: the kitchen takes them.
    await setDefaultStation(db, ctx, kitchen);

    const { order } = await createPosOrder(db, ctx, {
      lines: [
        { productId: k.id, quantity: 1 },
        { productId: d.id, quantity: 2 },
        { productId: s.id, quantity: 1 },
      ],
      idempotencyKey: randomBytes(12).toString("hex"),
    });
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(lines.find((l) => l.productId === s.id)?.stationId).toBe(kitchen);

    const statusOf = async () =>
      (await db.select({ s: orders.status }).from(orders).where(eq(orders.id, order.id)))[0]!.s;

    expect(await advanceStation(db, ctx, order.id, bar, "ready")).toEqual({ orderReady: false });
    expect(await statusOf()).toBe("preparing");
    const told = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.restaurantId, ctx.restaurant.id), eq(notifications.type, "station.ready")));
    expect(told[0]?.payload).toMatchObject({ orderId: order.id, name: "Bar" });

    await advanceStation(db, ctx, order.id, kitchen, "preparing");
    expect(await statusOf()).toBe("preparing");
    expect(await advanceStation(db, ctx, order.id, kitchen, "ready")).toEqual({ orderReady: true });
    expect(await statusOf()).toBe("ready");
    await expect(advanceStation(db, ctx, order.id, bar, "ready")).rejects.toThrow();
  });
});
