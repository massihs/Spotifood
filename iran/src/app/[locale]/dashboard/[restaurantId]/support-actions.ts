"use server";

import { getLocale } from "next-intl/server";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  getMyConversation,
  listMyConversations,
  sendMyMessage,
  startConversation,
  unreadSupportCount,
} from "@/server/modules/support/service";
import { getHelpArticle, listHelp, searchHelp } from "@/server/modules/support/help";

/** The help & support panel of the dashboard (any member of the restaurant). */

export async function supportOverviewAction(rid: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.view");
    const locale = await getLocale();
    const [conversations, articles, unread] = await Promise.all([
      listMyConversations(db, ctx),
      listHelp(db, locale, "restaurant"),
      unreadSupportCount(db, ctx.restaurant.id),
    ]);
    return { conversations, articles, unread };
  });
}

export async function helpSearchAction(rid: string, q: string) {
  return runAction(async () => {
    await actionContext(rid, "restaurant.view");
    return searchHelp(db, await getLocale(), String(q).slice(0, 300), "restaurant");
  });
}

export async function helpArticleAction(rid: string, slug: string) {
  return runAction(async () => {
    await actionContext(rid, "restaurant.view");
    const a = await getHelpArticle(db, await getLocale(), String(slug).slice(0, 80));
    return { slug: a.slug, title: a.title, body: a.body };
  });
}

export async function supportConversationAction(rid: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.view");
    return getMyConversation(db, ctx, id);
  });
}

export async function startSupportAction(rid: string, input: { body: string; page?: string }) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.view");
    return startConversation(db, ctx, input);
  });
}

export async function sendSupportAction(rid: string, id: string, body: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.view");
    await sendMyMessage(db, ctx, id, { body });
  });
}
