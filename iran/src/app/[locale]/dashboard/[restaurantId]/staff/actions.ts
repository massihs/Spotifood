"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  addPlannedShift,
  addTips,
  clockIn,
  clockOut,
  copyPreviousWeek,
  deleteEntry,
  deletePlannedShift,
  deleteTips,
  saveEntry,
  setHourlyRate,
} from "@/server/modules/staff/service";
import { zonedInstant, zonedSpan } from "@/server/modules/staff/payroll";

/** Clock in or out: every member, from the dashboard's top bar. */
export async function clockAction(rid: string, to: "in" | "out") {
  return runAction(async () => {
    const ctx = await actionContext(rid);
    if (to === "in") await clockIn(db, ctx);
    else await clockOut(db, ctx);
    refresh();
  });
}

type Span = { userId: string; day: string; start: string; end: string | null; note: string };

export async function saveEntryAction(rid: string, id: string | null, input: Span) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "members.manage");
    const s = zonedSpan(input.day, input.start, input.end, ctx.restaurant.timezone);
    await saveEntry(db, ctx, id, {
      userId: input.userId,
      clockInAt: s.start,
      clockOutAt: s.end,
      note: input.note,
    });
    refresh();
  });
}

export async function deleteEntryAction(rid: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "members.manage");
    await deleteEntry(db, ctx, id);
    refresh();
  });
}

export async function addShiftAction(rid: string, input: Span) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "members.manage");
    const s = zonedSpan(input.day, input.start, input.end ?? input.start, ctx.restaurant.timezone);
    await addPlannedShift(db, ctx, {
      userId: input.userId,
      startsAt: s.start,
      endsAt: s.end,
      note: input.note,
    });
    refresh();
  });
}

export async function deleteShiftAction(rid: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "members.manage");
    await deletePlannedShift(db, ctx, id);
    refresh();
  });
}

export async function copyWeekAction(rid: string, weekStart: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "members.manage");
    await copyPreviousWeek(db, ctx, zonedInstant(weekStart, "00:00", ctx.restaurant.timezone));
    refresh();
  });
}

export async function addTipsAction(rid: string, input: { day: string; amountCents: number; note: string }) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "members.manage");
    await addTips(db, ctx, input);
    refresh();
  });
}

export async function deleteTipsAction(rid: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "members.manage");
    await deleteTips(db, ctx, id);
    refresh();
  });
}

export async function setRateAction(rid: string, userId: string, cents: number | null) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "members.manage");
    await setHourlyRate(db, ctx, userId, cents);
    refresh();
  });
}
