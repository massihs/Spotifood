import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { emit, topics } from "@/server/infra/realtime";
import { conflict } from "@/server/errors";
import type { GuestContext } from "./sessions";

export const WAITER_CALLS = ["waiter", "bill", "water"] as const;
const COOLDOWN_MS = 45_000;

/**
 * A guest calls the staff from the table (فراخوان گارسون): waiter, the bill, or water. The
 * dashboard rings and shows the table. One call per guest every 45 seconds.
 */
export async function callWaiter(db: Database, guest: GuestContext, raw: string, now = new Date()) {
  const kind = z.enum(WAITER_CALLS).parse(raw);
  const rid = guest.restaurant.id;
  return db.transaction(async (tx) => {
    const [recent] = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.restaurantId, rid),
          eq(notifications.type, "waiter.call"),
          sql`${notifications.payload}->>'participantId' = ${guest.participant.id}`,
          gt(notifications.createdAt, new Date(now.getTime() - COOLDOWN_MS)),
        ),
      )
      .limit(1);
    if (recent) throw conflict("too_soon");
    await tx.insert(notifications).values({
      restaurantId: rid,
      type: "waiter.call",
      payload: { tableLabel: guest.table.label, kind, participantId: guest.participant.id },
    });
    await emit(tx, {
      topic: topics.restaurant(rid),
      type: "waiter.called",
      data: { tableLabel: guest.table.label, tableId: guest.table.id, kind },
    });
  });
}
