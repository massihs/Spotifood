"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { updateOnlineSettings } from "@/server/modules/online/service";

export async function updateOnlineSettingsAction(restaurantId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    await updateOnlineSettings(db, ctx, input);
    refresh();
  });
}
