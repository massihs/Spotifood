import type { DbOrTx } from "@/server/db/client";
import { emit, topics } from "@/server/infra/realtime";
import { notifyTeam } from "@/server/modules/team/sections";

/** Tells the team about a new online / kiosk order (bell, sound, live boards). */
export async function announceOrder(
  tx: DbOrTx,
  restaurantId: string,
  order: { id: string; number: string; totalCents: number },
  source: "online" | "kiosk",
) {
  const sections = await notifyTeam(
    tx,
    {
      restaurantId,
      type: "order.created",
      payload: {
        orderId: order.id,
        number: order.number,
        tableLabel: null,
        totalCents: order.totalCents,
        source,
      },
    },
    { orderId: order.id },
  );
  await emit(tx, {
    topic: topics.restaurant(restaurantId),
    type: "order.created",
    data: {
      orderId: order.id,
      number: order.number,
      tableId: null,
      tableLabel: "",
      source,
      ...(sections ? { sections } : {}),
    },
  });
}
