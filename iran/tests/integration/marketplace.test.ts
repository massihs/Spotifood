import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { customers, notifications, orders, restaurants } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import {
  listSuppliers,
  myMarketplaceOrders,
  placeMarketplaceOrder,
  saveListing,
  supplierCatalogue,
} from "@/server/modules/b2b/marketplace";
import { createOwnerWithRestaurant } from "../helpers/factories";

const key = () => `k_${randomBytes(10).toString("hex")}`;

describe("B2B marketplace", () => {
  it("lets a venue order from a listed supplier, into the supplier's trade sales", async () => {
    const seller = await createOwnerWithRestaurant("Torréfacteur", { plan: "professional" });
    const buyer = await createOwnerWithRestaurant("Café du coin", { plan: "professional" });
    const cat = await createCategory(db, seller.ctx, { name: "Cafés en grains" });
    const beans = await createProduct(db, seller.ctx, {
      categoryId: cat.id,
      name: "Arabica 1 kg",
      priceCents: 1_000_000,
      tradePriceCents: 800_000,
    });

    // Not listed: invisible.
    expect((await listSuppliers(db, buyer.ctx)).some((s) => s.id === seller.restaurant.id)).toBe(false);
    await saveListing(db, seller.ctx, {
      listed: true,
      pitch: "Torréfié chaque semaine",
      minOrderCents: 1_500_000,
    });
    expect((await listSuppliers(db, buyer.ctx)).map((s) => s.id)).toContain(seller.restaurant.id);
    const cat2 = await supplierCatalogue(db, buyer.ctx, seller.restaurant.id);
    expect(cat2.items.find((i) => i.id === beans.id)?.priceCents).toBe(800_000);

    // The buyer needs a mobile on its venue; then the minimum applies.
    const lines = [{ productId: beans.id, quantity: 1 }];
    await expect(
      placeMarketplaceOrder(db, buyer.ctx, seller.restaurant.id, { lines, idempotencyKey: key() }),
    ).rejects.toThrow(/buyer_phone_required/);
    await db.update(restaurants).set({ phone: "09121234567" }).where(eq(restaurants.id, buyer.restaurant.id));
    await expect(
      placeMarketplaceOrder(db, buyer.ctx, seller.restaurant.id, { lines, idempotencyKey: key() }),
    ).rejects.toThrow(/below_minimum_order/);
    const placed = await placeMarketplaceOrder(db, buyer.ctx, seller.restaurant.id, {
      lines: [{ productId: beans.id, quantity: 3 }],
      note: "Livraison mardi",
      idempotencyKey: key(),
    });
    expect(placed.totalCents).toBe(2_400_000);

    const [o] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.restaurantId, seller.restaurant.id), eq(orders.number, placed.number)));
    expect(o).toMatchObject({ isB2b: true, totalCents: 2_400_000 });
    const [c] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.restaurantId, seller.restaurant.id), eq(customers.phone, "09121234567")));
    expect(c).toMatchObject({ isBusiness: true, name: "Café du coin" });
    const [n] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.restaurantId, seller.restaurant.id),
          eq(notifications.type, "marketplace.order"),
        ),
      );
    expect(n?.payload).toMatchObject({ name: "Café du coin", number: placed.number });
    expect((await myMarketplaceOrders(db, buyer.ctx))[0]).toMatchObject({
      supplier: "Torréfacteur",
      number: placed.number,
    });
  });
});
