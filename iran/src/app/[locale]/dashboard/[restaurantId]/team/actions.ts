"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { isPermission, ROLE_PERMISSIONS, type Permission } from "@/server/auth/permissions";
import { addMember, removeMember, setMemberJob, updateMember } from "@/server/modules/members/service";
import { isJob } from "@/lib/jobs";

export async function addMemberAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    const password = String(fd.get("password") ?? "");
    const res = await addMember(db, ctx, {
      email: String(fd.get("email") ?? ""),
      fullName: String(fd.get("fullName") ?? ""),
      role: String(fd.get("role") ?? "staff") as "staff",
      job: isJob(fd.get("job")) ? (fd.get("job") as never) : undefined,
      stationId: String(fd.get("stationId") ?? "") || null,
      password: password === "" ? undefined : password,
    });
    refresh();
    return { accountCreated: res.accountCreated };
  });
}

/** The form sends the desired permission set; the service stores deltas from the role defaults. */
export async function updateMemberAction(
  restaurantId: string,
  memberId: string,
  _prev: unknown,
  fd: FormData,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    const role = String(fd.get("role") ?? "staff") as "staff" | "admin";
    const desired = new Set(fd.getAll("permissions").map(String).filter(isPermission));
    const defaults = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.staff;
    await updateMember(db, ctx, memberId, {
      role,
      grantedPermissions: [...desired].filter((p) => !defaults.has(p)) as Permission[],
      revokedPermissions: [...defaults].filter((p) => !desired.has(p)),
      status: fd.get("status") === "disabled" ? "disabled" : "active",
    });
    refresh();
  });
}

export async function removeMemberAction(restaurantId: string, memberId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    await removeMember(db, ctx, memberId);
    refresh();
  });
}

export async function setMemberJobAction(
  restaurantId: string,
  memberId: string,
  job: string | null,
  stationId: string | null,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    await setMemberJob(db, ctx, memberId, { job: isJob(job) ? job : null, stationId: stationId || null });
    refresh();
  });
}
