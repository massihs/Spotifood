import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { addMember, updateMember } from "@/server/modules/members/service";
import { listTeamJobs, saveTeamJob } from "@/server/modules/team/jobs";
import { homeScreen, resolveScreens, screenAllowed } from "@/lib/screens";
import { contextFor, createOwnerWithRestaurant, toSessionUser, uniqueEmail } from "../helpers/factories";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

async function ctxOf(userId: string, restaurantId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return contextFor(toSessionUser(u!), restaurantId);
}

describe("screens the owner opens to each member", () => {
  it("resolves defaults: owners and managers see everything, the kitchen only its tickets", () => {
    expect(resolveScreens({ role: "owner", memberScreens: ["kitchen"] })).toBeNull();
    expect(resolveScreens({ role: "admin", job: "manager" })).toBeNull();
    expect(resolveScreens({ role: "staff", job: "kitchen" })).toEqual(["kitchen"]);
    expect(resolveScreens({ role: "staff", job: null })).toBeNull();
    expect(
      resolveScreens({ role: "staff", job: "kitchen", jobScreens: ["orders", "kitchen", "nope"] }),
    ).toEqual(["orders", "kitchen"]);
    expect(homeScreen(["requests", "waiter"], "restaurant")).toBe("waiter");
    expect(homeScreen(["requests", "waiter"], "hotel")).toBe("requests");
    expect(screenAllowed(null, "reports")).toBe(true);
  });

  it("applies the job's screens, then the person's own", async () => {
    const { ctx } = await createOwnerWithRestaurant("Screens");
    const jobs = await listTeamJobs(db, ctx);
    const kitchen = jobs.find((j) => j.baseJob === "kitchen")!;
    const m = await addMember(db, ctx, {
      email: uniqueEmail("cook"),
      fullName: "Cook",
      role: "staff",
      teamJobId: kitchen.id,
      password: "CorrectHorse42!",
    });
    let staff = await ctxOf(m.member.userId, ctx.restaurant.id);
    expect(staff.screens).toEqual(["kitchen"]);

    // The owner opens the menu to every cook.
    await saveTeamJob(db, ctx, {
      id: kitchen.id,
      name: kitchen.name,
      icon: "chef-hat",
      baseJob: "kitchen",
      screens: ["kitchen", "menu"],
    });
    staff = await ctxOf(m.member.userId, ctx.restaurant.id);
    expect(staff.screens).toEqual(["kitchen", "menu"]);

    // …and the stock to this one only; then back to the job's screens.
    const base = {
      role: "staff" as const,
      grantedPermissions: [],
      revokedPermissions: [],
      status: "active" as const,
    };
    await updateMember(db, ctx, m.member.id, { ...base, screens: ["kitchen", "inventory"] });
    staff = await ctxOf(m.member.userId, ctx.restaurant.id);
    expect(staff.screens).toEqual(["kitchen", "inventory"]);
    await updateMember(db, ctx, m.member.id, { ...base, screens: null });
    staff = await ctxOf(m.member.userId, ctx.restaurant.id);
    expect(staff.screens).toEqual(["kitchen", "menu"]);
    // An edit that does not touch the screens keeps them.
    await updateMember(db, ctx, m.member.id, { ...base, screens: ["pos"] });
    await updateMember(db, ctx, m.member.id, base);
    expect((await ctxOf(m.member.userId, ctx.restaurant.id)).screens).toEqual(["pos"]);
  });
});
