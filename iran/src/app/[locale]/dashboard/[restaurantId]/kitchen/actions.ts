"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  deleteStation,
  saveStation,
  setDefaultStation,
  type STATION_COLORS,
} from "@/server/modules/kitchen/stations";
import { advanceStation } from "@/server/modules/kitchen/progress";

export async function saveStationAction(
  rid: string,
  id: string | null,
  input: { name: string; color: (typeof STATION_COLORS)[number]; categoryIds: string[] },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "menu.manage");
    await saveStation(db, ctx, id, input);
    refresh();
  });
}

export async function deleteStationAction(rid: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "menu.manage");
    await deleteStation(db, ctx, id);
    refresh();
  });
}

/** One station starts or finishes its part of an order (the bar its drinks, the grill its kebabs). */
export async function advanceStationAction(
  rid: string,
  orderId: string,
  stationId: string,
  to: "preparing" | "ready",
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.update_status");
    const r = await advanceStation(db, ctx, orderId, stationId, to);
    refresh();
    return r;
  });
}

export async function setDefaultStationAction(rid: string, stationId: string | null) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "menu.manage");
    await setDefaultStation(db, ctx, stationId);
    refresh();
  });
}
