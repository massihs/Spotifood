import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { helpArticles } from "@/server/db/schema";
import { notFound } from "@/server/errors";
import { STARTER_ARTICLES } from "./starter-articles";

/**
 * Help center: short articles per language, searched as the person types (no AI: a simple
 * word match on title, keywords and text, tolerant of Persian/Arabic spelling variants).
 */

export type HelpAudience = "restaurant" | "guest";

/** "ي" / "ك" / ZWNJ / diacritics / Persian digits folded so «کیو‌آر» finds «كيو آر». */
export function foldText(s: string) {
  return s
    .toLowerCase()
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[ة]/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[‌‍]/g, " ")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const words = (s: string) =>
  foldText(s)
    .split(" ")
    .filter((w) => w.length >= 2);

/** Inserts the starter articles the first time the help center is used. */
export async function ensureStarterArticles(db: DbOrTx) {
  const [row] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(helpArticles);
  if ((row?.n ?? 0) > 0) return;
  const values = STARTER_ARTICLES.flatMap((a, i) =>
    (["fa", "en"] as const).map((locale) => ({
      locale,
      slug: a.slug,
      title: a[locale].title,
      body: a[locale].body,
      keywords: a.keywords,
      audience: a.audience,
      sortOrder: i,
    })),
  );
  await db.insert(helpArticles).values(values).onConflictDoNothing();
}

/** Articles in the reader's language, else English, else Persian. */
async function articlesFor(db: DbOrTx, locale: string, audience: HelpAudience | "any") {
  await ensureStarterArticles(db);
  for (const l of [locale, "en", "fa"]) {
    const rows = await db
      .select()
      .from(helpArticles)
      .where(
        and(
          eq(helpArticles.locale, l),
          eq(helpArticles.published, true),
          audience === "any" ? undefined : inArray(helpArticles.audience, [audience, "all"]),
        ),
      )
      .orderBy(asc(helpArticles.sortOrder), asc(helpArticles.title));
    if (rows.length) return rows;
  }
  return [];
}

export async function listHelp(db: DbOrTx, locale: string, audience: HelpAudience | "any") {
  const rows = await articlesFor(db, locale, audience);
  return rows.map(({ slug, title, audience: a }) => ({ slug, title, audience: a }));
}

/** The best matching articles for a question (title counts most, then keywords, then text). */
export async function searchHelp(db: DbOrTx, locale: string, q: string, audience: HelpAudience | "any") {
  const terms = words(q).slice(0, 12);
  if (!terms.length) return [];
  const rows = await articlesFor(db, locale, audience);
  const scored = rows.map((a) => {
    const title = foldText(a.title);
    const keys = foldText(a.keywords);
    const body = foldText(a.body);
    let score = 0;
    for (const w of terms) {
      if (title.includes(w)) score += 3;
      if (keys.includes(w)) score += 2;
      if (body.includes(w)) score += 1;
    }
    return { a, score };
  });
  return scored
    .filter((x) => x.score >= 2)
    .sort((x, y) => y.score - x.score)
    .slice(0, 4)
    .map(({ a }) => ({ slug: a.slug, title: a.title, excerpt: a.body.split("\n")[0]!.slice(0, 140) }));
}

export async function getHelpArticle(db: DbOrTx, locale: string, slug: string) {
  await ensureStarterArticles(db);
  for (const l of [locale, "en", "fa"]) {
    const [a] = await db
      .select()
      .from(helpArticles)
      .where(and(eq(helpArticles.locale, l), eq(helpArticles.slug, slug), eq(helpArticles.published, true)));
    if (a) return a;
  }
  throw notFound();
}

// ─── Team side (super admin) ─────────────────────────────────────────────────

export async function listAllArticles(db: DbOrTx) {
  await ensureStarterArticles(db);
  return db
    .select()
    .from(helpArticles)
    .orderBy(asc(helpArticles.locale), asc(helpArticles.sortOrder), asc(helpArticles.title));
}

export const articleSchema = z.object({
  locale: z.enum(["fa", "en", "ar", "fr"]),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,80}$/),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(8000),
  keywords: z.string().trim().max(500).default(""),
  audience: z.enum(["restaurant", "guest", "all"]),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  published: z.boolean().default(true),
});

export async function saveArticle(db: Database, id: string | null, raw: unknown) {
  const input = articleSchema.parse(raw);
  if (id) {
    const [row] = await db.update(helpArticles).set(input).where(eq(helpArticles.id, id)).returning();
    if (!row) throw notFound();
    return row;
  }
  const [row] = await db.insert(helpArticles).values(input).returning();
  return row!;
}

export async function deleteArticle(db: Database, id: string) {
  await db.delete(helpArticles).where(eq(helpArticles.id, id));
}
