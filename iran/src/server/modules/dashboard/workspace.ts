import { and, count, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { orders, tableSessions } from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/sessions";
import { staffSpaces } from "@/server/modules/team/pro";
import { subscriptionsByOrganization } from "@/server/modules/billing/service";
import { listUserRestaurants } from "@/server/tenancy";

/**
 * The workspace home (/dashboard): every venue the person works at, with today's figures
 * (owners and managers only), the orders in progress, open tables, the plan, and where they land.
 */
export async function workspaceOverview(db: DbOrTx, user: SessionUser) {
  const [venues, spaces] = await Promise.all([listUserRestaurants(db, user.id), staffSpaces(db, user)]);
  if (!venues.length) return [];
  const subs = await subscriptionsByOrganization(
    db,
    venues.map((v) => v.organizationId),
  );
  return Promise.all(
    venues.map(async (v) => {
      const space = spaces.find((s) => s.id === v.id);
      const dayStart = sql`(date_trunc('day', now() at time zone ${v.timezone}) at time zone ${v.timezone})`;
      const [[today], [live], [tables]] = await Promise.all([
        db
          .select({ n: count(), total: sql<string>`coalesce(sum(${orders.totalCents}), 0)` })
          .from(orders)
          .where(
            and(
              eq(orders.restaurantId, v.id),
              notInArray(orders.status, ["cancelled", "pending_payment"]),
              gte(orders.placedAt, dayStart),
            ),
          ),
        db
          .select({ n: count() })
          .from(orders)
          .where(
            and(
              eq(orders.restaurantId, v.id),
              inArray(orders.status, ["received", "accepted", "preparing", "ready"]),
            ),
          ),
        db
          .select({ n: count() })
          .from(tableSessions)
          .where(and(eq(tableSessions.restaurantId, v.id), eq(tableSessions.status, "open"))),
      ]);
      const sees = v.role !== "staff";
      return {
        id: v.id,
        name: v.name,
        slug: v.slug,
        kind: v.kind,
        role: v.role,
        status: v.status,
        currency: v.currency,
        logoKey: v.logoKey,
        brandColor: v.brandColor,
        jobName: space?.jobName ?? null,
        href: space?.href ?? `/dashboard/${v.id}`,
        screens: space?.screens ?? null,
        /** Today's figures are for owners and managers. */
        revenueCents: sees ? Number(today?.total ?? 0) : null,
        ordersToday: sees ? (today?.n ?? 0) : null,
        liveOrders: live?.n ?? 0,
        openTables: tables?.n ?? 0,
        plan: sees ? (subs.get(v.organizationId) ?? null) : null,
      };
    }),
  );
}
export type WorkspaceVenue = Awaited<ReturnType<typeof workspaceOverview>>[number];
