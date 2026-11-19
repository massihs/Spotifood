import { connection } from "next/server";
import { db } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { handleBotUpdate } from "@/server/modules/channels/bot";

/**
 * POST /api/v1/bots/{restaurantId}/{secret} — updates from the restaurant's Bale or Telegram bot
 * (set as its webhook when the bot is connected). Always answers 200 once the secret matches, so
 * the platform does not resend an update the bot could not handle.
 */
export async function POST(req: Request, { params }: RouteContext<"/api/v1/bots/[restaurantId]/[secret]">) {
  await connection();
  const { restaurantId, secret } = await params;
  const update = await req.json().catch(() => null);
  if (!update || typeof update !== "object") return Response.json({ ok: true });
  try {
    await handleBotUpdate(db, restaurantId, secret, update);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") return Response.json({ ok: false }, { status: 404 });
    console.error("[bot]", e instanceof Error ? e.message : e);
  }
  return Response.json({ ok: true });
}
