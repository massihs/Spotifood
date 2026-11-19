import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { botCarts, restaurantSettings, restaurants } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { conflict, notFound } from "@/server/errors";
import { open, seal } from "@/server/infra/secret-box";
import { formatMoney } from "@/lib/money";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { getPublicMenu } from "@/server/modules/menu/public-cache";
import type { PublicMenu } from "@/server/modules/menu/public";

/**
 * The ordering bot on Bale (bale.ai, used widely in Iran) or Telegram — both speak the same Bot API.
 * The guest browses the menu with buttons, fills a basket in the chat, then one tap opens the
 * restaurant's ordering site with that basket, where they confirm and pay (Zarinpal or on site).
 */

export const BOT_APIS = { bale: "https://tapi.bale.ai", telegram: "https://api.telegram.org" } as const;
export type BotProvider = keyof typeof BOT_APIS;
const PURPOSE = "bot-token";
const appUrl = () => (process.env.APP_URL ?? "https://spotifood.ir").replace(/\/$/, "");

type Fetch = typeof fetch;

async function call(provider: BotProvider, token: string, method: string, body: unknown, f: Fetch = fetch) {
  const res = await f(`${BOT_APIS[provider]}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: unknown;
    description?: string;
  } | null;
  if (!json?.ok) throw new Error(`bot ${method}: ${json?.description ?? res.status}`);
  return json.result;
}

export const botSchema = z.object({
  provider: z.enum(["bale", "telegram"]),
  token: z
    .string()
    .trim()
    .regex(/^\d{5,15}:[\w-]{20,80}$/, "invalid_token"),
});

/** Connects the bot: checks the token, points its webhook here, keeps the token sealed. */
export async function connectBot(db: Database, ctx: RestaurantContext, raw: unknown, f: Fetch = fetch) {
  assertCan(ctx, "restaurant.manage");
  const input = botSchema.parse(raw);
  const me = (await call(input.provider, input.token, "getMe", {}, f).catch(() => null)) as {
    username?: string;
  } | null;
  if (!me) throw conflict("bot_token_rejected");
  const secret = randomBytes(18).toString("base64url");
  await call(
    input.provider,
    input.token,
    "setWebhook",
    {
      url: `${appUrl()}/api/v1/bots/${ctx.restaurant.id}/${secret}`,
      allowed_updates: ["message", "callback_query"],
    },
    f,
  );
  await db
    .update(restaurantSettings)
    .set({
      bot: {
        provider: input.provider,
        tokenSealed: seal(input.token, PURPOSE),
        secret,
        username: me.username ?? null,
      },
    })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "channels.bot_connected",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: { provider: input.provider, username: me.username ?? null },
  });
  return { provider: input.provider, username: me.username ?? null };
}

export async function disconnectBot(db: Database, ctx: RestaurantContext, f: Fetch = fetch) {
  assertCan(ctx, "restaurant.manage");
  const bot = await botOf(db, ctx.restaurant.id);
  if (bot) await call(bot.provider, bot.token, "deleteWebhook", {}, f).catch(() => null);
  await db
    .update(restaurantSettings)
    .set({ bot: null })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
}

async function botOf(db: DbOrTx, restaurantId: string) {
  const [row] = await db
    .select({ bot: restaurantSettings.bot })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));
  if (!row?.bot) return null;
  return { ...row.bot, token: open(row.bot.tokenSealed, PURPOSE) };
}

export async function botStatus(db: DbOrTx, restaurantId: string) {
  const [row] = await db
    .select({ bot: restaurantSettings.bot })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));
  return row?.bot ? { provider: row.bot.provider, username: row.bot.username ?? null } : null;
}

// ─── The conversation ────────────────────────────────────────────────────────

type Update = {
  message?: { chat: { id: number }; text?: string };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } };
};

type Cart = { productId: string; quantity: number }[];

/** Basket in the URL of the ordering site: "id*qty,id*qty" (the site fills its cart with it). */
export const cartParam = (lines: Cart) => lines.map((l) => `${l.productId}*${l.quantity}`).join(",");

/** A dish the bot can add: available, and no option the guest must choose. */
const simple = (p: PublicMenu["products"][string]) =>
  p.isAvailable && !p.optionGroups.some((g) => g.minSelect > 0);

async function loadCart(db: DbOrTx, restaurantId: string, chatId: number): Promise<Cart> {
  const [c] = await db
    .select({ lines: botCarts.lines })
    .from(botCarts)
    .where(and(eq(botCarts.restaurantId, restaurantId), eq(botCarts.chatId, chatId)));
  return c?.lines ?? [];
}

async function saveCart(db: DbOrTx, restaurantId: string, chatId: number, lines: Cart) {
  await db
    .insert(botCarts)
    .values({ restaurantId, chatId, lines })
    .onConflictDoUpdate({
      target: [botCarts.restaurantId, botCarts.chatId],
      set: { lines, updatedAt: new Date() },
    });
}

/**
 * One update from the bot platform. Buttons carry short codes: "c:<category index>",
 * "a:<product id>", "cart", "clear", "menu". Never throws on guest input: a bad code shows the menu.
 */
export async function handleBotUpdate(
  db: Database,
  restaurantId: string,
  secret: string,
  update: Update,
  f: Fetch = fetch,
) {
  const bot = await botOf(db, restaurantId);
  if (!bot || bot.secret !== secret) throw notFound();
  const [r] = await db
    .select({
      name: restaurants.name,
      slug: restaurants.slug,
      currency: restaurants.currency,
      locale: restaurants.defaultLocale,
      domain: restaurants.customDomain,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId));
  if (!r) throw notFound();
  const l = isLocale(r.locale) ? r.locale : DEFAULT_LOCALE;
  const messages = (await import(`../../../../messages/${l}.json`)).default;
  const t = createTranslator({ locale: l, messages, namespace: "bot" });
  const money = (c: number) => formatMoney(c, r.currency, l);
  const menu = await getPublicMenu(restaurantId);
  const site = r.domain ? `https://${r.domain}` : `${appUrl()}/r/${r.slug}/order`;
  const send = (method: string, body: Record<string, unknown>) =>
    call(bot.provider, bot.token, method, body, f);

  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const data = update.callback_query?.data ?? "";
  if (update.callback_query)
    await send("answerCallbackQuery", { callback_query_id: update.callback_query.id }).catch(() => null);

  const cats = menu.categories.filter((c) => c.productIds.some((id) => menu.products[id]));
  const menuKeyboard = () => ({
    inline_keyboard: [
      ...chunk(
        cats.map((c, i) => ({ text: c.name, callback_data: `c:${i}` })),
        2,
      ),
      [{ text: t("cartButton"), callback_data: "cart" }],
      [{ text: t("openSite"), url: site }],
    ],
  });

  if (data.startsWith("c:")) {
    const cat = cats[Number(data.slice(2))];
    if (cat) {
      const items = cat.productIds.map((id) => menu.products[id]).filter((p) => p != null);
      await send("sendMessage", {
        chat_id: chatId,
        text: t("category", { name: cat.name }),
        reply_markup: {
          inline_keyboard: [
            ...items
              .slice(0, 40)
              .map((p) =>
                simple(p)
                  ? [{ text: `➕ ${p.name} · ${money(p.priceCents)}`, callback_data: `a:${p.id}` }]
                  : [{ text: `${p.name} · ${p.isAvailable ? t("onSite") : t("soldOut")}`, url: site }],
              ),
            [
              { text: t("back"), callback_data: "menu" },
              { text: t("cartButton"), callback_data: "cart" },
            ],
          ],
        },
      });
      return;
    }
  }
  if (data.startsWith("a:")) {
    const p = menu.products[data.slice(2)];
    if (p && simple(p)) {
      const lines = await loadCart(db, restaurantId, chatId);
      const line = lines.find((x) => x.productId === p.id);
      if (line) line.quantity = Math.min(99, line.quantity + 1);
      else if (lines.length < 30) lines.push({ productId: p.id, quantity: 1 });
      await saveCart(db, restaurantId, chatId, lines);
      await send("sendMessage", {
        chat_id: chatId,
        text: t("added", { name: p.name, count: lines.reduce((s, x) => s + x.quantity, 0) }),
        reply_markup: {
          inline_keyboard: [
            [
              { text: t("cartButton"), callback_data: "cart" },
              { text: t("more"), callback_data: "menu" },
            ],
          ],
        },
      });
      return;
    }
  }
  if (data === "clear") {
    await saveCart(db, restaurantId, chatId, []);
  }
  if (data === "cart") {
    const lines = (await loadCart(db, restaurantId, chatId)).filter((x) => menu.products[x.productId]);
    if (!lines.length) {
      await send("sendMessage", { chat_id: chatId, text: t("empty"), reply_markup: menuKeyboard() });
      return;
    }
    const total = lines.reduce((s, x) => s + menu.products[x.productId]!.priceCents * x.quantity, 0);
    const text = [
      t("cartTitle"),
      ...lines.map((x) => `${x.quantity} × ${menu.products[x.productId]!.name}`),
      t("total", { amount: money(total) }),
    ].join("\n");
    await send("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [
          [{ text: t("checkout"), url: `${site}${site.includes("?") ? "&" : "?"}cart=${cartParam(lines)}` }],
          [
            { text: t("more"), callback_data: "menu" },
            { text: t("clear"), callback_data: "clear" },
          ],
        ],
      },
    });
    return;
  }
  await send("sendMessage", {
    chat_id: chatId,
    text: t("welcome", { name: r.name }),
    reply_markup: menuKeyboard(),
  });
}

function chunk<T>(a: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}
