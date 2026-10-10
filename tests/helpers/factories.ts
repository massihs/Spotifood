import { randomUUID } from "node:crypto";
import { db } from "@/server/db/client";
import { registerOwner } from "@/server/modules/auth/service";
import { hashPassword } from "@/server/auth/password";
import { restaurantMembers, users } from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/sessions";

export const uniqueEmail = (prefix = "user") => `${prefix}-${randomUUID().slice(0, 8)}@test.local`;
export const TEST_PASSWORD = "CorrectHorse42!";

export async function createOwnerWithRestaurant(name = "Le Test") {
  const email = uniqueEmail("owner");
  const res = await registerOwner(db, {
    email,
    password: TEST_PASSWORD,
    fullName: "Owner Test",
    restaurantName: name,
  });
  return { ...res, sessionUser: toSessionUser(res.user) };
}

export async function createUser(opts: { superAdmin?: boolean } = {}) {
  const [u] = await db
    .insert(users)
    .values({
      email: uniqueEmail(opts.superAdmin ? "admin" : "user"),
      passwordHash: await hashPassword(TEST_PASSWORD),
      fullName: "Test User",
      isSuperAdmin: opts.superAdmin ?? false,
    })
    .returning();
  return { user: u!, sessionUser: toSessionUser(u!) };
}

export async function addMember(
  restaurantId: string,
  userId: string,
  role: "admin" | "staff",
  extra: { granted?: string[]; revoked?: string[]; status?: "active" | "disabled" } = {},
) {
  await db.insert(restaurantMembers).values({
    restaurantId,
    userId,
    role,
    grantedPermissions: extra.granted ?? [],
    revokedPermissions: extra.revoked ?? [],
    status: extra.status ?? "active",
  });
}

export function toSessionUser(u: {
  id: string;
  email: string;
  fullName: string;
  locale: string | null;
  isSuperAdmin: boolean;
}): SessionUser {
  return { id: u.id, email: u.email, fullName: u.fullName, locale: u.locale, isSuperAdmin: u.isSuperAdmin };
}
