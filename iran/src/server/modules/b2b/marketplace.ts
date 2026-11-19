import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { customers, marketplaceOrders, orders, restaurantSettings, restaurants } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound, validation } from "@/server/errors";
import { MAX_AMOUNT_CENTS } from "@/lib/money";
import { normalizeIranMobile } from "@/lib/phone";
import { isUuid } from "@/lib/ids";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { loadPublicMenu } from "@/server/modules/menu/public";
import { notifyTeam } from "@/server/modules/team/sections";
import { ownerContext } from "@/server/modules/channels/owner";
import { createTradeOrder, saveTradeCustomer } from "./service";

/**
 * The B2B marketplace: a café, a roastery, a bakery or a central kitchen lists its trade catalogue,
 * and the other venues on Spotifood order from it in a few taps. The order lands in the supplier's
 * books as an ordinary trade order (the buyer becomes its professional customer, invoiced and on
 * account as usual), and the buyer follows it from its own dashboard.
 */

export const listingSchema = z.object({
  listed: z.boolean(),
  pitch: z.string().trim().max(300).default(""),
  minOrderCents: z.coerce.number().int().min(0).max(MAX_AMOUNT_CENTS).default(0),
});

export async function getListing(db: DbOrTx, restaurantId: string) {
  const [row] = await db
    .select({ m: restaurantSettings.marketplace })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));
  return {
    listed: row?.m?.listed ?? false,
    pitch: row?.m?.pitch ?? "",
    minOrderCents: row?.m?.minOrderCents ?? 0,
  };
}

export async function saveListing(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "restaurant.manage");
  const l = listingSchema.parse(raw);
  await db
    .update(restaurantSettings)
    .set({ marketplace: l })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "marketplace.listing",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: { listed: l.listed },
  });
}

/** The suppliers listed on the marketplace (other than the buyer itself). */
export async function listSuppliers(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "inventory.manage");
  return db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      city: restaurants.city,
      kind: restaurants.kind,
      logoKey: restaurants.logoKey,
      brandColor: restaurants.brandColor,
      currency: restaurants.currency,
      pitch: sql<string>`coalesce(${restaurantSettings.marketplace}->>'pitch', '')`,
      minOrderCents:
        sql<number>`coalesce((${restaurantSettings.marketplace}->>'minOrderCents')::bigint, 0)`.mapWith(
          Number,
        ),
    })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(
      and(
        isNull(restaurants.deletedAt),
        eq(restaurants.status, "active"),
        ne(restaurants.id, ctx.restaurant.id),
        sql`(${restaurantSettings.marketplace}->>'listed')::boolean is true`,
      ),
    )
    .orderBy(restaurants.name)
    .limit(200);
}

async function listedSupplier(db: DbOrTx, sellerId: string) {
  if (!isUuid(sellerId)) throw notFound();
  const [s] = await db
    .select({ id: restaurants.id, name: restaurants.name, currency: restaurants.currency })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(
      and(
        eq(restaurants.id, sellerId),
        isNull(restaurants.deletedAt),
        eq(restaurants.status, "active"),
        sql`(${restaurantSettings.marketplace}->>'listed')::boolean is true`,
      ),
    );
  if (!s) throw notFound();
  return s;
}

/** A supplier's catalogue at trade prices (trade-only categories included). */
export async function supplierCatalogue(db: DbOrTx, ctx: RestaurantContext, sellerId: string) {
  assertCan(ctx, "inventory.manage");
  const seller = await listedSupplier(db, sellerId);
  const menu = await loadPublicMenu(db, seller.id, { trade: true });
  const items = menu.categories.flatMap((c) =>
    c.productIds
      .map((id) => menu.products[id])
      .filter((p) => p != null && p.isAvailable)
      .map((p) => ({
        id: p!.id,
        name: p!.name,
        category: c.name,
        priceCents: p!.tradePriceCents ?? p!.priceCents,
      })),
  );
  return { seller, items, listing: await getListing(db, seller.id) };
}

export const marketplaceOrderSchema = z.object({
  lines: z
    .array(z.object({ productId: z.uuid(), quantity: z.coerce.number().int().min(1).max(9999) }))
    .min(1)
    .max(100),
  note: z.string().trim().max(400).default(""),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});

/** Orders from a supplier: a trade order in its books, to the buyer's professional customer file. */
export async function placeMarketplaceOrder(
  db: Database,
  ctx: RestaurantContext,
  sellerId: string,
  raw: unknown,
) {
  assertCan(ctx, "inventory.manage");
  const input = marketplaceOrderSchema.parse(raw);
  const seller = await listedSupplier(db, sellerId);
  if (seller.id === ctx.restaurant.id) throw conflict("own_restaurant");
  const [buyer] = await db
    .select({
      name: restaurants.name,
      phone: restaurants.phone,
      address: restaurants.addressLine1,
      city: restaurants.city,
    })
    .from(restaurants)
    .where(eq(restaurants.id, ctx.restaurant.id));
  const phone = buyer?.phone ? normalizeIranMobile(buyer.phone) : null;
  if (!buyer || !phone) throw validation("buyer_phone_required", { field: "phone" });

  // The supplier's minimum, checked on its trade prices before anything is rung up.
  const listing = await getListing(db, seller.id);
  if (listing.minOrderCents) {
    const menu = await loadPublicMenu(db, seller.id, { trade: true });
    const total = input.lines.reduce((sum, l) => {
      const p = menu.products[l.productId];
      return sum + (p ? (p.tradePriceCents ?? p.priceCents) * l.quantity : 0);
    }, 0);
    if (total < listing.minOrderCents)
      throw validation("below_minimum_order", { minOrderCents: listing.minOrderCents });
  }
  const sellerCtx = await ownerContext(db, seller.id);
  // The buyer as the supplier's professional customer (found by its mobile, or created).
  const [known] = await db
    .select({ id: customers.id, isBusiness: customers.isBusiness })
    .from(customers)
    .where(and(eq(customers.restaurantId, seller.id), eq(customers.phone, phone)));
  const customer = known?.isBusiness
    ? known
    : await saveTradeCustomer(db, sellerCtx, known?.id ?? null, {
        phone,
        name: buyer.name,
        address: [buyer.address, buyer.city].filter(Boolean).join("، ") || null,
      });

  const res = await createTradeOrder(db, sellerCtx, {
    customerId: customer.id,
    lines: input.lines,
    payment: null,
    delivery: false,
    note: [`Spotifood B2B · ${buyer.name}`, input.note].filter(Boolean).join(" · ").slice(0, 500),
    idempotencyKey: input.idempotencyKey,
  });
  await db.insert(marketplaceOrders).values({
    sellerId: seller.id,
    buyerId: ctx.restaurant.id,
    orderId: res.order.id,
    totalCents: res.order.totalCents,
  });
  await notifyTeam(db, {
    restaurantId: seller.id,
    type: "marketplace.order",
    payload: {
      name: buyer.name,
      number: res.order.number,
      amountCents: res.order.totalCents,
      currency: seller.currency,
    },
  });
  return { number: res.order.number, totalCents: res.order.totalCents };
}

/** The buyer's orders to suppliers, with where each stands. */
export async function myMarketplaceOrders(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "inventory.manage");
  return db
    .select({
      id: marketplaceOrders.id,
      supplier: restaurants.name,
      number: orders.number,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalCents: marketplaceOrders.totalCents,
      createdAt: marketplaceOrders.createdAt,
    })
    .from(marketplaceOrders)
    .innerJoin(orders, eq(orders.id, marketplaceOrders.orderId))
    .innerJoin(restaurants, eq(restaurants.id, marketplaceOrders.sellerId))
    .where(eq(marketplaceOrders.buyerId, ctx.restaurant.id))
    .orderBy(desc(marketplaceOrders.createdAt))
    .limit(50);
}
