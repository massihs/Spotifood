import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { pk, timestamps, tstz } from "./_helpers";
import { restaurants } from "./restaurant";
import { users } from "./platform";

/**
 * Support between the restaurants and the Spotifood team: one conversation per question, its
 * messages, and where it stands (`open` = the team owes an answer, `pending` = waiting on the
 * restaurant, `resolved`).
 */
export const supportConversations = pgTable(
  "support_conversations",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    openedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    subject: varchar({ length: 160 }).notNull(),
    status: varchar({ length: 12 }).notNull().default("open"),
    /** Where the person was and what they run (page, plan…), shown to the team. */
    context: jsonb().$type<Record<string, string>>().notNull().default({}),
    lastMessageAt: tstz().notNull().defaultNow(),
    lastFromSupport: boolean().notNull().default(false),
    /** Read marks of each side: unread = messages from the other side after it. */
    restaurantReadAt: tstz(),
    supportReadAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("support_conv_restaurant_idx").on(t.restaurantId, t.lastMessageAt),
    index("support_conv_status_idx").on(t.status, t.lastMessageAt),
  ],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: pk(),
    conversationId: uuid()
      .notNull()
      .references(() => supportConversations.id, { onDelete: "cascade" }),
    authorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    fromSupport: boolean().notNull().default(false),
    body: text().notNull(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index("support_msg_conv_idx").on(t.conversationId, t.createdAt)],
);

/** Help center: short how-to articles, per language, searched before a conversation starts. */
export const helpArticles = pgTable(
  "help_articles",
  {
    id: pk(),
    locale: varchar({ length: 5 }).notNull(),
    slug: varchar({ length: 80 }).notNull(),
    title: varchar({ length: 160 }).notNull(),
    body: text().notNull(),
    /** Extra words people type for it ("qr", "کیو آر", "چاپ"). */
    keywords: text().notNull().default(""),
    /** 'restaurant' (dashboard), 'guest' (customers), 'all' */
    audience: varchar({ length: 12 }).notNull().default("restaurant"),
    sortOrder: integer().notNull().default(0),
    published: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("help_articles_locale_slug_uq").on(t.locale, t.slug)],
);

/** Ready answers the team inserts in a reply. */
export const supportCannedReplies = pgTable("support_canned_replies", {
  id: pk(),
  title: varchar({ length: 80 }).notNull(),
  body: text().notNull(),
  sortOrder: integer().notNull().default(0),
  createdAt: tstz().notNull().defaultNow(),
});
