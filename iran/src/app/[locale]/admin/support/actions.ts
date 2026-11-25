"use server";

import { db } from "@/server/db/client";
import { runAction } from "@/server/actions";
import { getCurrentUser } from "@/server/auth/current";
import { forbidden } from "@/server/errors";
import {
  deleteCannedReply,
  getConversationForTeam,
  inboxCounts,
  listCannedReplies,
  listInbox,
  otherConversations,
  replyAsTeam,
  saveCannedReply,
  setConversationStatus,
  STATUSES,
  type SupportStatus,
} from "@/server/modules/support/service";
import { deleteArticle, saveArticle } from "@/server/modules/support/help";

/** The Spotifood team's support inbox and help center editor (super admins only). */
async function team() {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) throw forbidden();
  return user;
}

export async function inboxAction(status: SupportStatus | "all") {
  return runAction(async () => {
    await team();
    const [list, counts] = await Promise.all([
      listInbox(db, STATUSES.includes(status as SupportStatus) ? (status as SupportStatus) : "all"),
      inboxCounts(db),
    ]);
    return { list, counts };
  });
}

export async function teamConversationAction(id: string) {
  return runAction(async () => {
    await team();
    const conv = await getConversationForTeam(db, id);
    const others = await otherConversations(db, conv.restaurant.id, id);
    return { ...conv, others };
  });
}

export async function teamReplyAction(id: string, body: string) {
  return runAction(async () => {
    const admin = await team();
    await replyAsTeam(db, admin.id, id, { body });
  });
}

export async function teamStatusAction(id: string, status: SupportStatus) {
  return runAction(async () => {
    await team();
    await setConversationStatus(db, id, status);
  });
}

export async function cannedRepliesAction() {
  return runAction(async () => {
    await team();
    return listCannedReplies(db);
  });
}

export async function saveCannedAction(id: string | null, input: { title: string; body: string }) {
  return runAction(async () => {
    await team();
    await saveCannedReply(db, id, input);
  });
}

export async function deleteCannedAction(id: string) {
  return runAction(async () => {
    await team();
    await deleteCannedReply(db, id);
  });
}

export async function saveArticleAction(id: string | null, input: unknown) {
  return runAction(async () => {
    await team();
    return saveArticle(db, id, input);
  });
}

export async function deleteArticleAction(id: string) {
  return runAction(async () => {
    await team();
    await deleteArticle(db, id);
  });
}
