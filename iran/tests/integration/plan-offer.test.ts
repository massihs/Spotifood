import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { subscriptions } from "@/server/db/schema";
import { getEntitlements } from "@/server/entitlements";
import {
  adminEndOffer,
  adminGrantPlan,
  adminOfferPlan,
  getBillingView,
  offerEnd,
  offersByOrganization,
} from "@/server/modules/billing/service";
import { createOwnerWithRestaurant, createUser } from "../helpers/factories";

describe("plans offered by the admin", () => {
  it("offers a plan for a while, then the plan underneath comes back", async () => {
    const o = await createOwnerWithRestaurant("Offre");
    const { user: admin } = await createUser({ superAdmin: true });
    const rid = o.restaurant.id;
    await adminGrantPlan(db, admin.id, { restaurantId: rid, planCode: "starter", months: 3 });
    expect((await getEntitlements(db, rid)).planCode).toBe("starter");

    await adminOfferPlan(db, admin.id, {
      restaurantId: rid,
      planCode: "enterprise",
      unit: "days",
      amount: 10,
      note: "Partenaire",
    });
    expect((await getEntitlements(db, rid)).planCode).toBe("enterprise");
    const view = await getBillingView(db, o.ctx);
    expect(view.state).toMatchObject({ kind: "paid", planCode: "enterprise", gift: true, daysLeft: 10 });
    // No invoice for an offer.
    expect(view.history).toHaveLength(1);
    const offers = await offersByOrganization(db, [o.restaurant.organizationId]);
    expect(offers.get(o.restaurant.organizationId)).toMatchObject({ note: "Partenaire" });

    // Withdrawn: back to the paid plan, with its end date.
    expect(await adminEndOffer(db, admin.id, rid)).toBe(1);
    expect((await getEntitlements(db, rid)).planCode).toBe("starter");
    expect((await getBillingView(db, o.ctx)).state).toMatchObject({ planCode: "starter", gift: false });

    // An offer that ran out also gives the plan back.
    const gift = await adminOfferPlan(db, admin.id, {
      restaurantId: rid,
      planCode: "professional",
      unit: "forever",
    });
    expect((await getEntitlements(db, rid)).planCode).toBe("professional");
    await db
      .update(subscriptions)
      .set({ currentPeriodEnd: new Date(Date.now() - 1000) })
      .where(eq(subscriptions.id, gift.id));
    expect((await getEntitlements(db, rid)).planCode).toBe("starter");
    expect((await getBillingView(db, o.ctx)).state).toMatchObject({ planCode: "starter" });

    await expect(
      adminOfferPlan(db, admin.id, {
        restaurantId: rid,
        planCode: "starter",
        unit: "until",
        until: "2020-01-01",
      }),
    ).rejects.toMatchObject({ message: "offer_in_past" });
    const now = new Date("2026-01-31T10:00:00Z");
    expect(offerEnd({ unit: "weeks", amount: 2 }, now)?.toISOString()).toBe("2026-02-14T10:00:00.000Z");
    expect(offerEnd({ unit: "forever" }, now)).toBeNull();
  });
});
