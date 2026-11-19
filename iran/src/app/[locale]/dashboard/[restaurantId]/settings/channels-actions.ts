"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { connectBot, disconnectBot } from "@/server/modules/channels/bot";
import { setCustomDomain } from "@/server/modules/channels/domain";
import {
  createPlatformOrder,
  regenerateApiKey,
  saveCommissions,
  type PlatformOrderInput,
} from "@/server/modules/channels/platforms";

export async function setDomainAction(rid: string, domain: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.manage");
    await setCustomDomain(db, ctx, domain);
    refresh();
  });
}

export async function connectBotAction(rid: string, input: { provider: "bale" | "telegram"; token: string }) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.manage");
    const r = await connectBot(db, ctx, input);
    refresh();
    return r;
  });
}

export async function disconnectBotAction(rid: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.manage");
    await disconnectBot(db, ctx);
    refresh();
  });
}

export async function saveCommissionsAction(rid: string, input: Record<string, number>) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.manage");
    await saveCommissions(db, ctx, input);
    refresh();
  });
}

export async function regenerateApiKeyAction(rid: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.manage");
    return { key: await regenerateApiKey(db, ctx) };
  });
}

export async function createPlatformOrderAction(rid: string, input: PlatformOrderInput) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.create");
    const r = await createPlatformOrder(db, ctx, input);
    refresh();
    return r;
  });
}
