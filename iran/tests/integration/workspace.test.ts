import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import { addMember } from "@/server/modules/members/service";
import { listTeamJobs } from "@/server/modules/team/jobs";
import { workspaceOverview } from "@/server/modules/dashboard/workspace";
import { createOwnerWithRestaurant, uniqueEmail } from "../helpers/factories";

describe("workspace home", () => {
  it("shows each venue with today's figures to managers only", async () => {
    const { ctx, user } = await createOwnerWithRestaurant("Accueil");
    const cat = await createCategory(db, ctx, { name: "Cafés" });
    const p = await createProduct(db, ctx, { categoryId: cat.id, name: "Latte", priceCents: 1000 });
    await createPosOrder(db, ctx, {
      lines: [{ productId: p.id, quantity: 2 }],
      idempotencyKey: randomBytes(12).toString("hex"),
    });
    const [v] = await workspaceOverview(db, { ...ctx.user, id: user.id });
    expect(v).toMatchObject({ id: ctx.restaurant.id, ordersToday: 1, revenueCents: 2000, liveOrders: 1 });

    // A cook sees the venue and what is going on, not the takings.
    const jobs = await listTeamJobs(db, ctx);
    const m = await addMember(db, ctx, {
      email: uniqueEmail("cook"),
      fullName: "Cook",
      role: "staff",
      teamJobId: jobs.find((j) => j.baseJob === "kitchen")!.id,
      password: "CorrectHorse42!",
    });
    const [c] = await workspaceOverview(db, {
      id: m.member.userId,
      email: "",
      fullName: "Cook",
      locale: null,
      isSuperAdmin: false,
    });
    expect(c).toMatchObject({ revenueCents: null, ordersToday: null, plan: null, liveOrders: 1 });
    expect(c!.href).toBe(`/dashboard/${ctx.restaurant.id}/kitchen`);
  });
});
