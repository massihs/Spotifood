import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { restaurants } from "@/server/db/schema";
import { jobHome, staffLinkPath } from "@/lib/jobs";
import { listTeamJobs, staffLinkInfo } from "@/server/modules/team/jobs";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("team job sign-in link", () => {
  it("shows the venue and the job, and sends each job to its own screen", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const jobs = await listTeamJobs(db, ctx);
    const kitchen = jobs.find((j) => j.baseJob === "kitchen")!;
    expect(staffLinkPath(kitchen.id)).toBe(`/staff/${kitchen.id}`);

    const info = await staffLinkInfo(db, kitchen.id);
    expect(info).toMatchObject({
      restaurantId: ctx.restaurant.id,
      jobName: kitchen.name,
      baseJob: "kitchen",
    });
    expect(Object.keys(info!)).not.toContain("email");

    expect(jobHome("restaurant", "kitchen")).toBe("kitchen");
    expect(jobHome("restaurant", "waiter")).toBe("waiter");
    expect(jobHome("restaurant", "cashier")).toBe("orders");
    expect(jobHome("hotel", "waiter")).toBe("requests");
    expect(jobHome("restaurant", "manager")).toBeNull();
  });

  it("refuses unknown ids and suspended venues", async () => {
    expect(await staffLinkInfo(db, "not-a-uuid")).toBeNull();
    expect(await staffLinkInfo(db, randomUUID())).toBeNull();
    const { ctx } = await createOwnerWithRestaurant();
    const [job] = await listTeamJobs(db, ctx);
    await db.update(restaurants).set({ status: "suspended" }).where(eq(restaurants.id, ctx.restaurant.id));
    expect(await staffLinkInfo(db, job!.id)).toBeNull();
  });
});
