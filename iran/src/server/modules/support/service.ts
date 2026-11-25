import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  notifications,
  restaurants,
  supportCannedReplies,
  supportConversations,
  supportMessages,
  users,
} from "@/server/db/schema";
import { notFound } from "@/server/errors";
import { emit, topics } from "@/server/infra/realtime";
import { enforceRateLimit, rateLimiter } from "@/server/infra/rate-limit";
import { sms } from "@/server/infra/sms";
import { isUuid } from "@/lib/ids";
import { assertCan, type RestaurantContext } from "@/server/tenancy";

/**
 * Live support between a restaurant's team and the Spotifood team. The restaurant writes from
 * its dashboard; the team answers from /admin/support. Both sides update live (realtime events)
 * and see what the other has not read yet.
 */

export const STATUSES = ["open", "pending", "resolved"] as const;
export type SupportStatus = (typeof STATUSES)[number];

const body = z.string().trim().min(1).max(4000);
export const startSchema = z.object({
  body,
  subject: z.string().trim().max(160).optional(),
  /** Dashboard page the question was asked from. */
  page: z.string().trim().max(200).optional(),
});
export const messageSchema = z.object({ body });

const unreadForRestaurant = sql<boolean>`${supportConversations.lastFromSupport} and (${supportConversations.restaurantReadAt} is null or ${supportConversations.lastMessageAt} > ${supportConversations.restaurantReadAt})`;
const unreadForSupport = sql<boolean>`not ${supportConversations.lastFromSupport} and (${supportConversations.supportReadAt} is null or ${supportConversations.lastMessageAt} > ${supportConversations.supportReadAt})`;

async function emitBoth(db: DbOrTx, restaurantId: string, conversationId: string, fromSupport: boolean) {
  const data = { conversationId, restaurantId, fromSupport };
  await emit(db, { topic: topics.support(), type: "support.message", data });
  await emit(db, { topic: topics.restaurant(restaurantId), type: "support.message", data });
}

// ─── Restaurant side ─────────────────────────────────────────────────────────

export async function listMyConversations(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const last = sql<string>`(select ${supportMessages.body} from ${supportMessages} where ${supportMessages.conversationId} = ${supportConversations.id} order by ${supportMessages.createdAt} desc limit 1)`;
  return db
    .select({
      id: supportConversations.id,
      subject: supportConversations.subject,
      status: supportConversations.status,
      lastMessageAt: supportConversations.lastMessageAt,
      unread: unreadForRestaurant,
      last,
    })
    .from(supportConversations)
    .where(eq(supportConversations.restaurantId, ctx.restaurant.id))
    .orderBy(desc(supportConversations.lastMessageAt))
    .limit(30);
}

/** Answers from the team the restaurant has not opened yet (badge on the help button). */
export async function unreadSupportCount(db: DbOrTx, restaurantId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(supportConversations)
    .where(and(eq(supportConversations.restaurantId, restaurantId), unreadForRestaurant));
  return row?.n ?? 0;
}

async function ownConversation(db: DbOrTx, ctx: RestaurantContext, id: string) {
  if (!isUuid(id)) throw notFound();
  const [conv] = await db
    .select()
    .from(supportConversations)
    .where(and(eq(supportConversations.id, id), eq(supportConversations.restaurantId, ctx.restaurant.id)));
  if (!conv) throw notFound();
  return conv;
}

async function messagesOf(db: DbOrTx, conversationId: string) {
  return db
    .select({
      id: supportMessages.id,
      body: supportMessages.body,
      fromSupport: supportMessages.fromSupport,
      createdAt: supportMessages.createdAt,
      author: users.fullName,
    })
    .from(supportMessages)
    .leftJoin(users, eq(users.id, supportMessages.authorUserId))
    .where(eq(supportMessages.conversationId, conversationId))
    .orderBy(asc(supportMessages.createdAt))
    .limit(500);
}

/** A conversation with its messages; opening it marks the team's answers read. */
export async function getMyConversation(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "restaurant.view");
  const conv = await ownConversation(db, ctx, id);
  await db
    .update(supportConversations)
    .set({ restaurantReadAt: new Date() })
    .where(eq(supportConversations.id, conv.id));
  return { ...conv, messages: await messagesOf(db, conv.id) };
}

export async function startConversation(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "restaurant.view");
  const input = startSchema.parse(raw);
  await enforceRateLimit("supportMessage", ctx.user.id);
  const now = new Date();
  const subject = (input.subject || input.body.split("\n")[0]!).slice(0, 120);
  const conv = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(supportConversations)
      .values({
        restaurantId: ctx.restaurant.id,
        openedByUserId: ctx.user.id,
        subject,
        status: "open",
        context: {
          ...(input.page ? { page: input.page } : {}),
          role: ctx.role,
          kind: ctx.restaurant.kind,
        },
        lastMessageAt: now,
        restaurantReadAt: now,
      })
      .returning();
    await tx.insert(supportMessages).values({
      conversationId: c!.id,
      authorUserId: ctx.user.id,
      body: input.body,
      createdAt: now,
    });
    await emitBoth(tx, ctx.restaurant.id, c!.id, false);
    return c!;
  });
  await alertTeam(ctx.restaurant.name, subject);
  return { id: conv.id };
}

export async function sendMyMessage(db: Database, ctx: RestaurantContext, id: string, raw: unknown) {
  assertCan(ctx, "restaurant.view");
  const input = messageSchema.parse(raw);
  await enforceRateLimit("supportMessage", ctx.user.id);
  const conv = await ownConversation(db, ctx, id);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(supportMessages)
      .values({ conversationId: conv.id, authorUserId: ctx.user.id, body: input.body, createdAt: now });
    // A new message reopens a resolved question: the team owes an answer again.
    await tx
      .update(supportConversations)
      .set({ status: "open", lastMessageAt: now, lastFromSupport: false, restaurantReadAt: now })
      .where(eq(supportConversations.id, conv.id));
    await emitBoth(tx, ctx.restaurant.id, conv.id, false);
  });
}

/**
 * A text to the team's phone (ALERT_PHONE) for a new question, at most one every ten minutes
 * so a busy hour does not flood it. Best effort: the inbox is the source of truth.
 */
async function alertTeam(restaurantName: string, subject: string) {
  const phone = process.env.ALERT_PHONE;
  if (!phone) return;
  const slot = await rateLimiter.hit("support-alert", 1, 10 * 60_000);
  if (!slot.ok) return;
  await sms()
    .send(phone, `Spotifood پشتیبانی: پیام تازه از ${restaurantName.slice(0, 40)}\n${subject.slice(0, 80)}`)
    .catch((err) => console.error("[support] alert sms failed", err));
}

// ─── Team side (super admin; the caller checks) ─────────────────────────────

export async function listInbox(db: DbOrTx, status: SupportStatus | "all" = "all") {
  const last = sql<string>`(select ${supportMessages.body} from ${supportMessages} where ${supportMessages.conversationId} = ${supportConversations.id} order by ${supportMessages.createdAt} desc limit 1)`;
  return db
    .select({
      id: supportConversations.id,
      subject: supportConversations.subject,
      status: supportConversations.status,
      lastMessageAt: supportConversations.lastMessageAt,
      restaurant: restaurants.name,
      restaurantId: restaurants.id,
      unread: unreadForSupport,
      last,
    })
    .from(supportConversations)
    .innerJoin(restaurants, eq(restaurants.id, supportConversations.restaurantId))
    .where(status === "all" ? undefined : eq(supportConversations.status, status))
    .orderBy(desc(supportConversations.lastMessageAt))
    .limit(200);
}

/** Questions waiting on the team: still open, or with a message the team has not read. */
export async function inboxCounts(db: DbOrTx) {
  const [row] = await db
    .select({
      open: sql<number>`count(*) filter (where ${supportConversations.status} = 'open')`.mapWith(Number),
      unread: sql<number>`count(*) filter (where ${unreadForSupport})`.mapWith(Number),
    })
    .from(supportConversations);
  return { open: row?.open ?? 0, unread: row?.unread ?? 0 };
}

export async function getConversationForTeam(db: Database, id: string) {
  if (!isUuid(id)) throw notFound();
  const [row] = await db
    .select({
      conv: supportConversations,
      restaurant: {
        id: restaurants.id,
        name: restaurants.name,
        slug: restaurants.slug,
        city: restaurants.city,
        phone: restaurants.phone,
        status: restaurants.status,
      },
      openedBy: { name: users.fullName, email: users.email },
    })
    .from(supportConversations)
    .innerJoin(restaurants, eq(restaurants.id, supportConversations.restaurantId))
    .leftJoin(users, eq(users.id, supportConversations.openedByUserId))
    .where(eq(supportConversations.id, id));
  if (!row) throw notFound();
  await db
    .update(supportConversations)
    .set({ supportReadAt: new Date() })
    .where(eq(supportConversations.id, id));
  return { ...row, messages: await messagesOf(db, id) };
}

export async function replyAsTeam(db: Database, adminId: string, id: string, raw: unknown) {
  const input = messageSchema.parse(raw);
  if (!isUuid(id)) throw notFound();
  const now = new Date();
  await db.transaction(async (tx) => {
    const [conv] = await tx
      .update(supportConversations)
      .set({ status: "pending", lastMessageAt: now, lastFromSupport: true, supportReadAt: now })
      .where(eq(supportConversations.id, id))
      .returning();
    if (!conv) throw notFound();
    await tx.insert(supportMessages).values({
      conversationId: id,
      authorUserId: adminId,
      fromSupport: true,
      body: input.body,
      createdAt: now,
    });
    // The person who asked also gets it in their bell, if the chat is closed.
    if (conv.openedByUserId) {
      await tx.insert(notifications).values({
        restaurantId: conv.restaurantId,
        userId: conv.openedByUserId,
        type: "support.reply",
        payload: { conversationId: id, name: conv.subject.slice(0, 60) },
      });
      await emit(tx, {
        topic: topics.restaurant(conv.restaurantId),
        type: "notification.created",
        data: { type: "support.reply" },
      });
    }
    await emitBoth(tx, conv.restaurantId, id, true);
  });
}

export async function setConversationStatus(db: Database, id: string, status: SupportStatus) {
  if (!isUuid(id) || !STATUSES.includes(status)) throw notFound();
  const [conv] = await db
    .update(supportConversations)
    .set({ status })
    .where(eq(supportConversations.id, id))
    .returning({ restaurantId: supportConversations.restaurantId });
  if (!conv) throw notFound();
  await emitBoth(db, conv.restaurantId, id, true);
}

// ─── Ready answers ──────────────────────────────────────────────────────────

export async function listCannedReplies(db: DbOrTx) {
  return db
    .select()
    .from(supportCannedReplies)
    .orderBy(asc(supportCannedReplies.sortOrder), asc(supportCannedReplies.title));
}

export const cannedSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(4000),
});

export async function saveCannedReply(db: Database, id: string | null, raw: unknown) {
  const input = cannedSchema.parse(raw);
  if (id) {
    if (!isUuid(id)) throw notFound();
    await db.update(supportCannedReplies).set(input).where(eq(supportCannedReplies.id, id));
    return;
  }
  await db.insert(supportCannedReplies).values(input);
}

export async function deleteCannedReply(db: Database, id: string) {
  if (!isUuid(id)) throw notFound();
  await db.delete(supportCannedReplies).where(eq(supportCannedReplies.id, id));
}

/** Older conversations of the same restaurant (the team sees the history). */
export async function otherConversations(db: DbOrTx, restaurantId: string, exceptId: string) {
  return db
    .select({
      id: supportConversations.id,
      subject: supportConversations.subject,
      status: supportConversations.status,
      lastMessageAt: supportConversations.lastMessageAt,
    })
    .from(supportConversations)
    .where(and(eq(supportConversations.restaurantId, restaurantId), ne(supportConversations.id, exceptId)))
    .orderBy(desc(supportConversations.lastMessageAt))
    .limit(10);
}
