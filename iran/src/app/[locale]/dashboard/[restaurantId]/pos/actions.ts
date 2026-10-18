"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  addCashMovement,
  closeShift,
  createPosOrder,
  openShift,
  type PosOrderInput,
} from "@/server/modules/pos/service";

export async function createPosOrderAction(restaurantId: string, input: PosOrderInput) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "orders.create");
    const { order } = await createPosOrder(db, ctx, input);
    refresh();
    return { number: order.number, totalCents: order.totalCents };
  });
}

export async function openShiftAction(restaurantId: string, openingFloatCents: number) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "cash.manage");
    await openShift(db, ctx, { openingFloatCents });
    refresh();
  });
}

export async function cashMovementAction(
  restaurantId: string,
  direction: "in" | "out",
  amountCents: number,
  reason: string,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "cash.manage");
    await addCashMovement(db, ctx, { direction, amountCents, reason });
    refresh();
  });
}

export async function closeShiftAction(restaurantId: string, countedCashCents: number, note: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "cash.manage");
    const { summary, shift } = await closeShift(db, ctx, { countedCashCents, note });
    refresh();
    return { expected: summary.expectedCash, counted: shift.countedCashCents ?? 0 };
  });
}
