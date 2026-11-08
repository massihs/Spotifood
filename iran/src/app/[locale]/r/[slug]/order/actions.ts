"use server";

import { db } from "@/server/db/client";
import { runAction } from "@/server/actions";
import { getCurrentDiner } from "@/server/auth/diner";
import { unauthenticated } from "@/server/errors";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { routing } from "@/i18n/routing";
import { env } from "@/server/env";
import {
  cancelUnpaidOnlineOrder,
  payOnlineOrderOnSite,
  placeKioskOrder,
  placeOnlineOrder,
} from "@/server/modules/online/service";
import { startOnlineOrderPayment } from "@/server/modules/payments/service";

export async function placeOnlineOrderAction(slug: string, input: unknown) {
  return runAction(async () => {
    const diner = await getCurrentDiner();
    if (!diner) throw unauthenticated("sign_in_required");
    await enforceRateLimit("qrEntry", `online:${diner.id}`);
    const order = await placeOnlineOrder(db, { id: diner.id, phone: diner.phone }, slug, input);
    return { orderId: order.id };
  });
}

/** The counter tablet: no sign-in, the kiosk link is the credential. */
export async function placeKioskOrderAction(token: string, input: unknown) {
  return runAction(async () => {
    await enforceRateLimit("qrEntry", `kiosk:${token}`);
    const order = await placeKioskOrder(db, token, input);
    return { orderId: order.id, number: order.number };
  });
}

async function signedInDiner() {
  const diner = await getCurrentDiner();
  if (!diner) throw unauthenticated("sign_in_required");
  return diner;
}

/** Card payment of an online order: returns the Zarinpal page to go to. */
export async function payOnlineOrderAction(
  slug: string,
  orderId: string,
  provider: string,
  idempotencyKey: string,
) {
  return runAction(async () => {
    const diner = await signedInDiner();
    await enforceRateLimit("onlinePayment", diner.id);
    const locale = await getLocale();
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    const result = await startOnlineOrderPayment(
      db,
      diner,
      slug,
      orderId,
      { provider: provider as "zarinpal", idempotencyKey },
      { returnUrl: `${env().APP_URL}${prefix}/r/${slug}/o/${orderId}` },
    );
    return { redirectUrl: result.redirectUrl };
  });
}

/** "I'll pay at pickup / on delivery" after all. */
export async function payOnSiteAction(slug: string, orderId: string) {
  return runAction(async () => {
    const diner = await signedInDiner();
    await payOnlineOrderOnSite(db, diner, slug, orderId);
    refresh();
  });
}

export async function cancelUnpaidOrderAction(slug: string, orderId: string) {
  return runAction(async () => {
    const diner = await signedInDiner();
    await cancelUnpaidOnlineOrder(db, diner, slug, orderId);
    refresh();
  });
}
