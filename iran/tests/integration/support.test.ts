import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import {
  getConversationForTeam,
  getMyConversation,
  inboxCounts,
  listMyConversations,
  replyAsTeam,
  sendMyMessage,
  setConversationStatus,
  startConversation,
  unreadSupportCount,
} from "@/server/modules/support/service";
import { searchHelp, getHelpArticle } from "@/server/modules/support/help";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("support chat", () => {
  it("a restaurant asks, the team answers, unread marks and status follow", async () => {
    const { ctx } = await createOwnerWithRestaurant("Support");
    const { id } = await startConversation(db, ctx, {
      body: "QR codes do not print",
      page: "/dashboard/x/tables",
    });
    expect((await inboxCounts(db)).open).toBeGreaterThan(0);

    const team = await getConversationForTeam(db, id);
    expect(team.messages).toHaveLength(1);
    expect(team.conv.context.page).toBe("/dashboard/x/tables");

    await replyAsTeam(db, ctx.user.id, id, { body: "Open Tables & QR, then print." });
    expect(await unreadSupportCount(db, ctx.restaurant.id)).toBe(1);
    const bell = await db.select().from(notifications).where(eq(notifications.userId, ctx.user.id));
    expect(bell.some((n) => n.type === "support.reply")).toBe(true);

    const mine = await getMyConversation(db, ctx, id);
    expect(mine.status).toBe("pending");
    expect(mine.messages.map((m) => m.fromSupport)).toEqual([false, true]);
    expect(await unreadSupportCount(db, ctx.restaurant.id)).toBe(0);

    await setConversationStatus(db, id, "resolved");
    await sendMyMessage(db, ctx, id, { body: "Thanks, one more thing" });
    const list = await listMyConversations(db, ctx);
    expect(list[0]!.status).toBe("open");
  });

  it("another restaurant cannot read the conversation", async () => {
    const a = await createOwnerWithRestaurant("A");
    const b = await createOwnerWithRestaurant("B");
    const { id } = await startConversation(db, a.ctx, { body: "secret" });
    await expect(getMyConversation(db, b.ctx, id)).rejects.toThrow();
  });

  it("the help center finds articles despite spelling variants", async () => {
    const hits = await searchHelp(db, "fa", "چطور كيو آر ميزها را چاپ کنم", "restaurant");
    expect(hits[0]?.slug).toBe("print-table-qr");
    const en = await getHelpArticle(db, "ar", "sold-out");
    expect(en.locale).toBe("en");
  });
});
