"use server";

import { refresh } from "next/cache";
import { runAction } from "@/server/actions";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { parseMoneyInput } from "@/lib/money";
import { AppError } from "@/server/errors";
import { listPayoutBalances, recordPayout, setPlatformPayments } from "@/server/modules/payouts/service";

/** Commission (in %) and split settlement on Spotifood's Zarinpal account. */
export async function setPlatformPaymentsAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const admin = await requireSuperAdmin();
    const pct = Number(String(fd.get("feePct") ?? "0").replace(",", "."));
    if (!Number.isFinite(pct) || pct < 0 || pct > 30)
      throw new AppError("VALIDATION", "invalid", { field: "feePct" });
    await setPlatformPayments(db, admin, { feeBps: Math.round(pct * 100), split: fd.get("split") === "on" });
    refresh();
  });
}

/** A bank transfer made to a restaurant (amount typed in the display currency). */
export async function recordPayoutAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const admin = await requireSuperAdmin();
    const restaurantId = String(fd.get("restaurantId") ?? "");
    const row = (await listPayoutBalances(db, admin)).find((b) => b.restaurantId === restaurantId);
    if (!row) throw new AppError("NOT_FOUND", "not_found");
    let amountCents = parseMoneyInput(String(fd.get("amount") ?? ""), row.currency);
    if (!amountCents) throw new AppError("VALIDATION", "invalid", { field: "amount" });
    // The form shows whole tomans: the few rials below one toman are paid with the rest.
    if (Math.abs(amountCents - row.dueCents) < 1000) amountCents = row.dueCents;
    await recordPayout(db, admin, {
      restaurantId,
      amountCents,
      reference: String(fd.get("reference") ?? ""),
      note: String(fd.get("note") ?? ""),
    });
    refresh();
  });
}
