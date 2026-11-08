"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { closeTableSession, moveTableSession } from "@/server/modules/floor/service";
import { listNotifications, markNotificationsRead } from "@/server/modules/notifications/service";
import { pauseOnlineOrders } from "@/server/modules/online/service";

/** Busy mode for online orders (0 = resume now). */
export async function pauseOnlineAction(restaurantId: string, minutes: number) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "orders.update_status");
    const until = await pauseOnlineOrders(db, ctx, minutes);
    refresh();
    return { until: until?.toISOString() ?? null };
  });
}

export async function listNotificationsAction(restaurantId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.view");
    const { items, unread } = await listNotifications(db, ctx, 20);
    return {
      unread,
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        payload: n.payload,
        createdAt: n.createdAt.toISOString(),
        read: !!n.readAt,
      })),
    };
  });
}

export async function markNotificationsReadAction(restaurantId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.view");
    await markNotificationsRead(db, ctx);
  });
}

export async function closeTableAction(restaurantId: string, tableId: string, force: boolean) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "sessions.close");
    await closeTableSession(db, ctx, tableId, { force });
    refresh();
  });
}

export async function moveTableAction(restaurantId: string, fromTableId: string, toTableId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "sessions.close");
    const res = await moveTableSession(db, ctx, fromTableId, toTableId);
    refresh();
    return res;
  });
}
