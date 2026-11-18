import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { restaurants, stockItems, stockMovements, stockTransfers } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, forbidden, notFound } from "@/server/errors";
import {
  assertCan,
  can,
  listUserRestaurants,
  loadRestaurantContext,
  type RestaurantContext,
} from "@/server/tenancy";

/**
 * Stock sent between the venues of one group (a central kitchen supplying its branches, a shared
 * storeroom): out of one stock, into the other at the sender's average cost. The item is matched by
 * name and unit in the receiving venue, or created there.
 */

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** The other venues of the group this person may send stock to. */
export async function transferTargets(db: DbOrTx, ctx: RestaurantContext) {
  if (!can(ctx, "inventory.manage")) return [];
  const mine = await listUserRestaurants(db, ctx.user.id);
  const out = [];
  for (const v of mine) {
    if (v.id === ctx.restaurant.id || v.organizationId !== ctx.restaurant.organizationId) continue;
    const other = await loadRestaurantContext(db, ctx.user, v.id).catch(() => null);
    if (other && can(other, "inventory.manage")) out.push({ id: v.id, name: v.name });
  }
  return out;
}

export const transferSchema = z.object({
  toRestaurantId: z.uuid(),
  note: z.string().trim().max(200).default(""),
  lines: z
    .array(z.object({ stockItemId: z.uuid(), quantity: z.coerce.number().positive().max(1e9) }))
    .min(1)
    .max(50),
});

export async function transferStock(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof transferSchema>,
) {
  assertCan(ctx, "inventory.manage");
  const input = transferSchema.parse(raw);
  if (input.toRestaurantId === ctx.restaurant.id) throw conflict("same_venue");
  const target = await loadRestaurantContext(db, ctx.user, input.toRestaurantId);
  if (target.restaurant.organizationId !== ctx.restaurant.organizationId) throw forbidden();
  assertCan(target, "inventory.manage");
  const from = ctx.restaurant.id;
  const to = target.restaurant.id;
  return db.transaction(async (tx) => {
    const ids = [...new Set(input.lines.map((l) => l.stockItemId))];
    const items = await tx
      .select()
      .from(stockItems)
      .where(
        and(eq(stockItems.restaurantId, from), isNull(stockItems.deletedAt), inArray(stockItems.id, ids)),
      )
      .for("update");
    if (items.length !== ids.length) throw notFound();
    const done = [];
    for (const l of input.lines) {
      const src = items.find((i) => i.id === l.stockItemId)!;
      if (src.quantity < l.quantity) throw conflict("not_enough_stock", { item: src.name });
      // The same ingredient in the other venue (same name and unit), else a new one.
      let [dst] = await tx
        .select()
        .from(stockItems)
        .where(
          and(
            eq(stockItems.restaurantId, to),
            isNull(stockItems.deletedAt),
            eq(stockItems.unit, src.unit),
            or(ilike(stockItems.name, src.name.replace(/[%_\\]/g, "\\$&"))),
          ),
        )
        .for("update");
      if (!dst)
        [dst] = await tx
          .insert(stockItems)
          .values({
            restaurantId: to,
            name: src.name,
            unit: src.unit,
            lowStockThreshold: src.lowStockThreshold,
          })
          .returning();
      const base = Math.max(0, dst!.quantity);
      const avg = Math.round(
        (base * dst!.avgCostCents + l.quantity * src.avgCostCents) / (base + l.quantity),
      );
      src.quantity = round3(src.quantity - l.quantity);
      await tx.update(stockItems).set({ quantity: src.quantity }).where(eq(stockItems.id, src.id));
      await tx
        .update(stockItems)
        .set({ quantity: round3(dst!.quantity + l.quantity), avgCostCents: avg })
        .where(eq(stockItems.id, dst!.id));
      const note = `${ctx.restaurant.name} → ${target.restaurant.name}`.slice(0, 200);
      await tx.insert(stockMovements).values([
        {
          restaurantId: from,
          stockItemId: src.id,
          kind: "transfer_out",
          quantity: -l.quantity,
          unitCostCents: src.avgCostCents,
          note,
          userId: ctx.user.id,
        },
        {
          restaurantId: to,
          stockItemId: dst!.id,
          kind: "transfer_in",
          quantity: l.quantity,
          unitCostCents: src.avgCostCents,
          note,
          userId: ctx.user.id,
        },
      ]);
      const [t] = await tx
        .insert(stockTransfers)
        .values({
          fromRestaurantId: from,
          toRestaurantId: to,
          fromItemId: src.id,
          toItemId: dst!.id,
          quantity: l.quantity,
          unitCostCents: src.avgCostCents,
          note: input.note || null,
          userId: ctx.user.id,
        })
        .returning();
      done.push(t!);
    }
    for (const rid of [from, to])
      await recordAudit(tx, {
        action: "inventory.transfer",
        actorUserId: ctx.user.id,
        restaurantId: rid,
        entityType: "stock_transfer",
        entityId: done[0]!.id,
        metadata: { from, to, lines: input.lines.length },
      });
    return done;
  });
}

/** Transfers in and out of this venue, latest first. */
export async function listTransfers(db: DbOrTx, ctx: RestaurantContext, limit = 50) {
  assertCan(ctx, "inventory.view");
  const rid = ctx.restaurant.id;
  const rows = await db
    .select()
    .from(stockTransfers)
    .where(or(eq(stockTransfers.fromRestaurantId, rid), eq(stockTransfers.toRestaurantId, rid)))
    .orderBy(desc(stockTransfers.createdAt))
    .limit(limit);
  if (!rows.length) return [];
  const venueIds = [...new Set(rows.flatMap((r) => [r.fromRestaurantId, r.toRestaurantId]))];
  const itemIds = [...new Set(rows.map((r) => (r.fromRestaurantId === rid ? r.fromItemId : r.toItemId)))];
  const [venues, items] = await Promise.all([
    db
      .select({ id: restaurants.id, name: restaurants.name })
      .from(restaurants)
      .where(inArray(restaurants.id, venueIds)),
    db
      .select({ id: stockItems.id, name: stockItems.name, unit: stockItems.unit })
      .from(stockItems)
      .where(inArray(stockItems.id, itemIds)),
  ]);
  return rows.map((r) => {
    const out = r.fromRestaurantId === rid;
    const item = items.find((i) => i.id === (out ? r.fromItemId : r.toItemId));
    return {
      id: r.id,
      out,
      other: venues.find((v) => v.id === (out ? r.toRestaurantId : r.fromRestaurantId))?.name ?? "—",
      item: item?.name ?? "—",
      unit: item?.unit ?? "",
      quantity: r.quantity,
      valueCents: Math.round(r.quantity * r.unitCostCents),
      createdAt: r.createdAt,
    };
  });
}
