import { index, jsonb, pgTable, uuid, varchar, uniqueIndex, bigint } from "drizzle-orm/pg-core";
import { money, pk, timestamps, tstz } from "./_helpers";
import { orders } from "./orders";
import { customers } from "./customers";
import { restaurants } from "./restaurant";

/** Every automatic text sent (birthday, win-back, new dish): no double send, and its results. */
export const smsAutomationSends = pgTable(
  "sms_automation_sends",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** birthday | winback | new_dish */
    kind: varchar({ length: 16 }).notNull(),
    /** What makes it unique: the year of a birthday, the last order of a win-back, the dish. */
    ref: varchar({ length: 64 }).notNull(),
    sentAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sms_automation_sends_uq").on(t.restaurantId, t.customerId, t.kind, t.ref),
    index("sms_automation_sends_restaurant_idx").on(t.restaurantId, t.sentAt),
  ],
);

/** A guest's basket in the ordering bot (Bale, Telegram), per chat. */
export const botCarts = pgTable(
  "bot_carts",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    chatId: bigint({ mode: "number" }).notNull(),
    lines: jsonb().$type<{ productId: string; quantity: number }[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex("bot_carts_chat_uq").on(t.restaurantId, t.chatId)],
);

/** An order placed on the B2B marketplace: by one venue (the buyer) to another (the supplier). */
export const marketplaceOrders = pgTable(
  "marketplace_orders",
  {
    id: pk(),
    sellerId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    buyerId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** The order in the supplier's books (a trade order to the buyer's customer file). */
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    totalCents: money().notNull(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index("marketplace_orders_buyer_idx").on(t.buyerId, t.createdAt),
    index("marketplace_orders_seller_idx").on(t.sellerId, t.createdAt),
  ],
);
