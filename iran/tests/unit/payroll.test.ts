import { describe, expect, it } from "vitest";
import {
  entryHours,
  lateness,
  missedShifts,
  splitTips,
  zonedInstant,
  zonedSpan,
} from "@/server/modules/staff/payroll";

const at = (iso: string) => new Date(iso);
const TZ = "Asia/Tehran";

describe("payroll", () => {
  it("turns a local day and time into the right instant (Tehran is UTC+3:30)", () => {
    expect(zonedInstant("2026-11-18", "08:30", TZ).toISOString()).toBe("2026-11-18T05:00:00.000Z");
    const night = zonedSpan("2026-11-18", "18:00", "02:00", TZ);
    expect((night.end!.getTime() - night.start.getTime()) / 3_600_000).toBe(8);
  });

  it("counts hours inside the period and caps a forgotten clock-out", () => {
    const e = { userId: "a", clockInAt: at("2026-11-18T05:00:00Z"), clockOutAt: at("2026-11-18T13:00:00Z") };
    expect(entryHours(e, at("2026-11-18T00:00:00Z"), at("2026-11-19T00:00:00Z"), new Date())).toBe(8);
    expect(entryHours(e, at("2026-11-18T09:00:00Z"), at("2026-11-19T00:00:00Z"), new Date())).toBe(4);
    const open = { ...e, clockOutAt: null };
    expect(
      entryHours(open, at("2026-11-01T00:00:00Z"), at("2026-12-01T00:00:00Z"), at("2026-11-25T00:00:00Z")),
    ).toBe(16);
  });

  it("shares a day's tips by the hours worked, to the exact rial", () => {
    const entries = [
      { userId: "a", clockInAt: at("2026-11-18T05:00:00Z"), clockOutAt: at("2026-11-18T11:00:00Z") },
      { userId: "b", clockInAt: at("2026-11-18T08:00:00Z"), clockOutAt: at("2026-11-18T11:00:00Z") },
    ];
    const { share, undistributed } = splitTips(
      [
        { day: "2026-11-18", amountCents: 1000 },
        { day: "2026-11-17", amountCents: 500 },
      ],
      entries,
      TZ,
      new Date(),
    );
    expect(share.get("a")! + share.get("b")!).toBe(1000);
    expect(share.get("a")).toBe(667);
    expect(undistributed).toEqual(["2026-11-17"]);
  });

  it("finds late arrivals and missed shifts", () => {
    const planned = [
      { userId: "a", startsAt: at("2026-11-18T05:00:00Z"), endsAt: at("2026-11-18T13:00:00Z") },
      { userId: "b", startsAt: at("2026-11-18T05:00:00Z"), endsAt: at("2026-11-18T13:00:00Z") },
    ];
    const entries = [
      { userId: "a", clockInAt: at("2026-11-18T05:20:00Z"), clockOutAt: at("2026-11-18T13:00:00Z") },
    ];
    expect(lateness(planned, entries).get("a")).toEqual({ count: 1, minutes: 20 });
    expect(missedShifts(planned, entries, at("2026-11-19T00:00:00Z")).map((p) => p.userId)).toEqual(["b"]);
  });
});
