import { and, eq, inArray } from "drizzle-orm";
import { tidy, type Nutrition } from "@/lib/nutrition";
import type { DbOrTx } from "@/server/db/client";
import { products } from "@/server/db/schema";

/** Nutrition of one portion of each dish, to freeze on the order lines (null = not given). */
export async function nutritionOf(db: DbOrTx, rid: string, productIds: string[]) {
  const out = new Map<string, Nutrition | null>();
  if (!productIds.length) return out;
  const rows = await db
    .select({ id: products.id, nutrition: products.nutrition, kcal: products.caloriesKcal })
    .from(products)
    .where(and(eq(products.restaurantId, rid), inArray(products.id, [...new Set(productIds)])));
  for (const r of rows) {
    const n = tidy({ ...(r.nutrition ?? {}), ...(r.kcal != null ? { kcal: r.kcal } : {}) });
    out.set(r.id, Object.keys(n).length ? n : null);
  }
  return out;
}
