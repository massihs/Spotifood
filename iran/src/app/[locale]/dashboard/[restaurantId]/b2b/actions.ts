"use server";

import { refresh } from "next/cache";
import type { z } from "zod";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  createTradeOrder,
  receiveTradePayment,
  removeTradeCustomer,
  saveTradeCustomer,
  type TradeCustomerInput,
  type tradeOrderSchema,
  type tradePaymentSchema,
} from "@/server/modules/b2b/service";

export async function saveTradeCustomerAction(rid: string, id: string | null, input: TradeCustomerInput) {
  return runAction(async () => {
    const row = await saveTradeCustomer(db, await actionContext(rid, "customers.manage"), id, input);
    refresh();
    return row.id;
  });
}

export async function removeTradeCustomerAction(rid: string, id: string) {
  return runAction(async () => {
    await removeTradeCustomer(db, await actionContext(rid, "customers.manage"), id);
    refresh();
  });
}

export async function createTradeOrderAction(rid: string, input: z.input<typeof tradeOrderSchema>) {
  return runAction(async () => {
    const { order } = await createTradeOrder(db, await actionContext(rid, "orders.create"), input);
    refresh();
    return { id: order.id, number: order.number, totalCents: order.totalCents };
  });
}

export async function receiveTradePaymentAction(rid: string, input: z.input<typeof tradePaymentSchema>) {
  return runAction(async () => {
    await receiveTradePayment(db, await actionContext(rid, "payments.record"), input);
    refresh();
  });
}
