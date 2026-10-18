"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { cancelPendingRequest, requestSubscription } from "@/server/modules/music/service";

export async function requestMusicAction(restaurantId: string, plan: "weekly" | "monthly", themeId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await requestSubscription(db, ctx, { plan, themeId });
    refresh();
  });
}

export async function cancelMusicRequestAction(restaurantId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await cancelPendingRequest(db, ctx);
    refresh();
  });
}
