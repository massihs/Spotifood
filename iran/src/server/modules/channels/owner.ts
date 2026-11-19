import { and, eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { restaurantMembers, users } from "@/server/db/schema";
import { notFound } from "@/server/errors";
import { loadRestaurantContext } from "@/server/tenancy";

/**
 * The context of a restaurant's owner, for work done on its behalf without anyone signed in there:
 * an integration pushing a platform order, a marketplace order from another venue.
 */
export async function ownerContext(db: Database, restaurantId: string) {
  const [owner] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      locale: users.locale,
      isSuperAdmin: users.isSuperAdmin,
    })
    .from(restaurantMembers)
    .innerJoin(users, eq(users.id, restaurantMembers.userId))
    .where(and(eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.role, "owner")))
    .limit(1);
  if (!owner) throw notFound();
  return loadRestaurantContext(db, owner, restaurantId);
}
