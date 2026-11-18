import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import { updateOrderStatus } from "@/server/modules/orders/service";
import { createPurchase, createStockItem, setRecipe } from "@/server/modules/inventory/service";
import { foodCosts, purchasePlan, staffAnomalies } from "@/server/modules/insights/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

const key = () => randomBytes(12).toString("hex");

describe("save-money tools", () => {
  it("plans purchases, flags food cost after a price rise and reviews the staff", async () => {
    const { ctx } = await createOwnerWithRestaurant("Économies", { plan: "professional" });
    const cat = await createCategory(db, ctx, { name: "Grill" });
    const kebab = await createProduct(db, ctx, { categoryId: cat.id, name: "Kebab", priceCents: 100_000 });
    const meat = await createStockItem(db, ctx, { name: "Viande", unit: "kg", lowStockThreshold: 1 });
    await createPurchase(db, ctx, {
      lines: [{ stockItemId: meat.id, quantity: 10, unitCostCents: 100_000 }],
    });
    await setRecipe(db, ctx, kebab.id, { items: [{ stockItemId: meat.id, quantity: 0.25 }] });

    // Sold 8 kebabs: 2 kg of meat used.
    for (let i = 0; i < 4; i++)
      await createPosOrder(db, ctx, {
        lines: [{ productId: kebab.id, quantity: 2 }],
        payment: { provider: "cash", tenderedCents: 200_000 },
        idempotencyKey: key(),
      });
    const plan = await purchasePlan(db, ctx, { days: 7, factor: 1 });
    expect(plan.hasHistory).toBe(true);
    const row = plan.rows.find((r) => r.id === meat.id)!;
    expect(row.quantity).toBe(8);
    expect(row.avgDaily).toBeCloseTo(2 / 28, 3);

    // 25 % food cost: under the 35 % target.
    let costs = await foodCosts(db, ctx);
    expect(costs.rows[0]).toMatchObject({ name: "Kebab", costCents: 25_000, over: false });

    // Meat bought much dearer: the average cost jumps, the team is told, the dish is now over.
    await createPurchase(db, ctx, { lines: [{ stockItemId: meat.id, quantity: 8, unitCostCents: 300_000 }] });
    costs = await foodCosts(db, ctx);
    expect(costs.rows[0]!.over).toBe(true);
    expect(costs.rows[0]!.suggestedPriceCents).toBeGreaterThan(100_000);
    const [alert] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.restaurantId, ctx.restaurant.id), eq(notifications.type, "cost.rise")));
    expect(alert?.payload).toMatchObject({ name: "Viande", count: 1 });

    // Cancellations show up per person.
    const o = await createPosOrder(db, ctx, {
      lines: [{ productId: kebab.id, quantity: 1 }],
      idempotencyKey: key(),
    });
    await updateOrderStatus(db, ctx, o.order.id, "cancelled");
    const review = await staffAnomalies(db, ctx, {
      from: new Date(Date.now() - 3_600_000),
      to: new Date(Date.now() + 60_000),
    });
    expect(review.rows[0]).toMatchObject({ userId: ctx.user.id, orders: 4, cancellations: 1 });
  });
});
