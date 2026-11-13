import { and, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { restaurantMembers, restaurants, teamJobs } from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/sessions";
import { homeScreen, resolveScreens, screenPath, type Screen } from "@/lib/screens";

/**
 * The team space (spotifood.ir/pro): each venue a person works at, with their job and the
 * screens the owner opened to them, and where they land (their first screen).
 */
export async function staffSpaces(db: DbOrTx, user: SessionUser) {
  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      kind: restaurants.kind,
      status: restaurants.status,
      logoKey: restaurants.logoKey,
      brandColor: restaurants.brandColor,
      role: restaurantMembers.role,
      job: restaurantMembers.job,
      memberScreens: restaurantMembers.screens,
      jobName: teamJobs.name,
      jobIcon: teamJobs.icon,
      jobScreens: teamJobs.screens,
    })
    .from(restaurantMembers)
    .innerJoin(restaurants, eq(restaurants.id, restaurantMembers.restaurantId))
    .leftJoin(teamJobs, eq(teamJobs.id, restaurantMembers.teamJobId))
    .where(
      and(
        eq(restaurantMembers.userId, user.id),
        eq(restaurantMembers.status, "active"),
        isNull(restaurants.deletedAt),
      ),
    )
    .orderBy(restaurants.name);
  return rows.map((r) => {
    const screens: Screen[] | null = resolveScreens({
      role: r.role,
      job: r.job,
      memberScreens: r.memberScreens,
      jobScreens: r.jobScreens,
    });
    const home = homeScreen(screens, r.kind);
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      suspended: r.status === "suspended",
      logoKey: r.logoKey,
      brandColor: r.brandColor,
      role: r.role,
      job: r.job,
      jobName: r.jobName,
      jobIcon: r.jobIcon,
      /** null: every screen (owners, managers). */
      screens,
      href: `/dashboard/${r.id}${home ? screenPath(home) : ""}`,
    };
  });
}
