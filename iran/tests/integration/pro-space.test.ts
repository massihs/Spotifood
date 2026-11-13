import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { addMember, updateMember } from "@/server/modules/members/service";
import { listTeamJobs } from "@/server/modules/team/jobs";
import { staffSpaces } from "@/server/modules/team/pro";
import { createOwnerWithRestaurant, uniqueEmail } from "../helpers/factories";

describe("team space (/pro)", () => {
  it("sends each person to their own first screen", async () => {
    const { ctx, user } = await createOwnerWithRestaurant("Pro");
    const jobs = await listTeamJobs(db, ctx);
    const m = await addMember(db, ctx, {
      email: uniqueEmail("cook"),
      fullName: "Cook",
      role: "staff",
      teamJobId: jobs.find((j) => j.baseJob === "kitchen")!.id,
      password: "CorrectHorse42!",
    });
    const cook = { id: m.member.userId, email: "", fullName: "Cook", locale: null, isSuperAdmin: false };
    let [space] = await staffSpaces(db, cook);
    expect(space).toMatchObject({ href: `/dashboard/${ctx.restaurant.id}/kitchen`, screens: ["kitchen"] });

    // The owner opens the till too, in first place for this person.
    const base = {
      role: "staff" as const,
      grantedPermissions: [],
      revokedPermissions: [],
      status: "active" as const,
    };
    await updateMember(db, ctx, m.member.id, { ...base, screens: ["pos", "kitchen"] });
    [space] = await staffSpaces(db, cook);
    expect(space!.href).toBe(`/dashboard/${ctx.restaurant.id}/pos`);

    // The owner sees everything and lands on the overview.
    const [own] = await staffSpaces(db, { ...cook, id: user.id });
    expect(own).toMatchObject({ screens: null, href: `/dashboard/${ctx.restaurant.id}` });
  });
});
