"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  addToQueue,
  createBooking,
  setReservationStatus,
  updateReservationSettings,
} from "@/server/modules/reservations/service";

export async function createBookingAction(
  rid: string,
  input: {
    name: string;
    phone: string;
    partySize: number;
    startsAt: string;
    note: string;
    area: "any" | "indoor" | "outdoor";
  },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.create");
    await createBooking(db, ctx, input);
    refresh();
  });
}

export async function addToQueueAction(
  rid: string,
  input: { name: string; phone: string; partySize: number },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.create");
    const r = await addToQueue(db, ctx, input);
    refresh();
    return { number: r.queueNumber };
  });
}

export async function setReservationStatusAction(rid: string, id: string, to: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.update_status");
    await setReservationStatus(db, ctx, id, to);
    refresh();
  });
}

export async function updateReservationSettingsAction(
  rid: string,
  input: {
    enabled: boolean;
    autoConfirm: boolean;
    slotCapacity: number;
    maxParty: number;
    durationMin: number;
  },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.manage");
    await updateReservationSettings(db, ctx, input);
    refresh();
  });
}
