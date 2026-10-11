/**
 * Development seed. Idempotent: safe to run several times.
 *   npm run db:seed
 * Creates plans, global category templates, a super admin and "Restaurant Demo" (20 tables, menu).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/server/db/client";
import {
  categories,
  diningTables,
  orders,
  globalCategoryTemplates,
  optionGroups,
  optionValues,
  plans,
  productOptionGroups,
  productImages,
  products,
  restaurants,
  taxRates,
  users,
  restaurantMembers,
  restaurantSettings,
  subscriptions,
} from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { DEFAULT_CATEGORY_TEMPLATES, DEFAULT_PLANS } from "@/server/modules/catalog/defaults";
import { createOrganization, createRestaurant } from "@/server/modules/restaurants/service";
import { randomToken } from "@/lib/ids";
import { loadRestaurantContext } from "@/server/tenancy";
import { addProductImage } from "@/server/modules/menu/images";
import { loadPublicMenu } from "@/server/modules/menu/public";
import { enterTableByQr, loadGuestContext, renameParticipant } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder, updateOrderStatus } from "@/server/modules/orders/service";
import { newIdempotencyKey, recordStaffPayment } from "@/server/modules/payments/service";
import type { OrderStatus } from "@/server/modules/orders/status";

const DEMO_OWNER = {
  email: "owner@demo.spotifood.local",
  password: "DemoOwner!2026",
  fullName: "علی رضایی",
};
const DEMO_STAFF = {
  email: "staff@demo.spotifood.local",
  password: "DemoStaff!2026",
  fullName: "مریم احمدی",
};

async function upsertUser(email: string, password: string, fullName: string, isSuperAdmin = false) {
  const [existing] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      fullName,
      isSuperAdmin,
    })
    .returning();
  return created!;
}

type DemoProduct = {
  name: string;
  description: string;
  /** Price in tomans (stored ×1000: 1 toman = 10 rials = 1000 minor units). */
  price: number;
  ingredients?: string;
  allergens?: string[];
  kcal?: number;
  weight?: number;
  featured?: boolean;
  tags?: string[];
  options?: ("side" | "extras" | "skewer")[];
};

const toman = (t: number) => t * 1000;

/** Demo menu of a typical Iranian restaurant (prices are plausible placeholders, in tomans). */
const MENU: { key: string; name: string; items: DemoProduct[] }[] = [
  {
    key: "starters",
    name: "پیش‌غذا",
    items: [
      {
        name: "کشک بادمجان",
        description: "بادمجان کبابی، کشک محلی، نعناع داغ و گردو.",
        price: 180_000,
        ingredients: "بادمجان، کشک، نعناع، پیاز داغ، گردو",
        allergens: ["milk", "nuts"],
        kcal: 380,
        featured: true,
        tags: ["vegetarian"],
      },
      {
        name: "میرزا قاسمی",
        description: "بادمجان دودی، گوجه، سیر و تخم‌مرغ به سبک گیلان.",
        price: 170_000,
        allergens: ["eggs"],
        kcal: 320,
        tags: ["vegetarian"],
      },
      {
        name: "ماست و خیار",
        description: "ماست پرچرب، خیار، نعناع خشک و گل محمدی.",
        price: 120_000,
        allergens: ["milk"],
        tags: ["vegetarian"],
      },
    ],
  },
  {
    key: "soups",
    name: "سوپ و آش",
    items: [
      {
        name: "آش رشته",
        description: "رشته، حبوبات، سبزی معطر، کشک و پیاز داغ.",
        price: 150_000,
        allergens: ["gluten", "milk"],
        kcal: 450,
        tags: ["vegetarian"],
      },
      { name: "سوپ جو", description: "جو پرک، مرغ، هویج و جعفری.", price: 120_000, allergens: ["gluten"] },
    ],
  },
  {
    key: "salads",
    name: "سالاد",
    items: [
      {
        name: "سالاد شیرازی",
        description: "خیار، گوجه، پیاز، آبغوره و نعناع.",
        price: 90_000,
        tags: ["vegan"],
      },
      {
        name: "سالاد سزار",
        description: "مرغ گریل، کاهو، پنیر پارمزان و نان تست.",
        price: 260_000,
        allergens: ["gluten", "milk", "eggs"],
      },
    ],
  },
  {
    key: "meat",
    name: "کباب",
    items: [
      {
        name: "چلوکباب کوبیده",
        description: "دو سیخ کوبیده گوسفندی، برنج ایرانی و گوجه کبابی.",
        price: 450_000,
        ingredients: "گوشت گوسفندی، پیاز، برنج، زعفران، کره",
        allergens: ["milk"],
        kcal: 980,
        weight: 450,
        featured: true,
        options: ["side", "extras", "skewer"],
      },
      {
        name: "جوجه کباب",
        description: "سینه مرغ زعفرانی، برنج ایرانی و گوجه کبابی.",
        price: 420_000,
        allergens: ["milk"],
        kcal: 820,
        options: ["side", "extras"],
      },
      {
        name: "کباب برگ",
        description: "فیله گوساله، برنج ایرانی، کره و سماق.",
        price: 890_000,
        allergens: ["milk"],
        kcal: 1050,
        featured: true,
        options: ["side", "extras"],
      },
    ],
  },
  {
    key: "mains",
    name: "خورش و پلو",
    items: [
      {
        name: "قورمه سبزی",
        description: "سبزی سرخ‌شده، لوبیا قرمز، گوشت گوسفندی و لیمو عمانی، با برنج.",
        price: 360_000,
        kcal: 760,
        featured: true,
        options: ["extras"],
      },
      {
        name: "زرشک پلو با مرغ",
        description: "ران مرغ زعفرانی، برنج، زرشک و خلال پسته.",
        price: 380_000,
        allergens: ["nuts"],
        options: ["extras"],
      },
      {
        name: "قیمه",
        description: "لپه، گوشت گوسفندی و سیب‌زمینی سرخ‌کرده، با برنج.",
        price: 340_000,
        options: ["extras"],
      },
      {
        name: "باقالی پلو با ماهیچه",
        description: "ماهیچه گوسفندی، برنج با باقالی و شوید.",
        price: 780_000,
        options: ["extras"],
      },
    ],
  },
  {
    key: "desserts",
    name: "دسر",
    items: [
      {
        name: "بستنی سنتی",
        description: "بستنی زعفرانی با گلاب و پسته.",
        price: 130_000,
        allergens: ["milk", "nuts"],
      },
      { name: "فالوده شیرازی", description: "با آبلیمو تازه و شربت.", price: 110_000, tags: ["vegan"] },
      {
        name: "شله‌زرد",
        description: "برنج، زعفران، گلاب، دارچین و خلال بادام.",
        price: 100_000,
        allergens: ["nuts"],
      },
    ],
  },
  {
    key: "tea",
    name: "چای و دمنوش",
    items: [
      { name: "چای ایرانی", description: "چای دم‌کشیده با نبات.", price: 50_000 },
      { name: "دمنوش گل‌گاوزبان", description: "با لیمو عمانی.", price: 80_000 },
      { name: "قهوه ترک", description: "", price: 90_000 },
    ],
  },
  {
    key: "soft_drinks",
    name: "نوشیدنی",
    items: [
      { name: "دوغ محلی", description: "دوغ گازدار با پونه.", price: 60_000, allergens: ["milk"] },
      { name: "شربت سکنجبین", description: "با خیار رنده‌شده.", price: 80_000 },
      { name: "نوشابه", description: "", price: 40_000 },
      { name: "آب معدنی", description: "", price: 25_000 },
    ],
  },
];

async function seedPlatform() {
  for (const p of DEFAULT_PLANS) {
    await db
      .insert(plans)
      .values(p)
      .onConflictDoUpdate({
        target: plans.code,
        set: {
          name: p.name,
          limits: p.limits,
          priceMonthlyCents: p.priceMonthlyCents,
          sortOrder: p.sortOrder,
        },
      });
  }
  for (const [i, key] of DEFAULT_CATEGORY_TEMPLATES.entries()) {
    await db.insert(globalCategoryTemplates).values({ key, sortOrder: i }).onConflictDoNothing();
  }
  const email = process.env.SEED_SUPERADMIN_EMAIL ?? "admin@spotifood.local";
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (!password && process.env.NODE_ENV === "production") {
    // Never create a production admin with a well-known password.
    console.warn("! SEED_SUPERADMIN_PASSWORD not set: super admin not created");
  } else {
    // Only creates the account; an existing account (and its changed password) is left untouched.
    await upsertUser(email, password ?? "ChangeMe!2026", "Platform Admin", true);
    console.log(`✓ super admin ${email}`);
  }
  console.log(
    `✓ platform: ${DEFAULT_PLANS.length} plans, ${DEFAULT_CATEGORY_TEMPLATES.length} category templates`,
  );
}

async function seedDemoRestaurant() {
  const [existing] = await db.select().from(restaurants).where(eq(restaurants.slug, "restaurant-demo"));
  if (existing) {
    console.log("✓ demo restaurant already present — skipping");
    return;
  }

  const owner = await upsertUser(DEMO_OWNER.email, DEMO_OWNER.password, DEMO_OWNER.fullName);
  const staff = await upsertUser(DEMO_STAFF.email, DEMO_STAFF.password, DEMO_STAFF.fullName);

  await db.transaction(async (tx) => {
    const org = await createOrganization(tx, {
      name: "گروه نمونه",
      ownerUserId: owner.id,
      billingEmail: owner.email,
    });
    const restaurant = await createRestaurant(tx, {
      organizationId: org.id,
      ownerUserId: owner.id,
      name: "رستوران نمونه",
    });
    await tx
      .update(restaurants)
      .set({
        // Persian names produce no Latin slug: keep a stable one for the demo.
        slug: "restaurant-demo",
        phone: "+98 21 1234 5678",
        addressLine1: "خیابان ولیعصر، پلاک ۱۲",
        city: "تهران",
        postalCode: "1234567890",
        email: "contact@demo.spotifood.local",
      })
      .where(eq(restaurants.id, restaurant.id));
    await tx
      .update(restaurantSettings)
      .set({
        orderPrefix: "D",
        legalName: "شرکت نمونه رستوران",
        // Online payment uses whatever this deployment offers (Stripe keys / dev simulator).
        onlinePaymentEnabled: true,
        enabledPaymentProviders: [
          "cash",
          "on_site_terminal",
          "pay_later",
          "stripe",
          "zarinpal",
          "mock_online",
        ],
      })
      .where(eq(restaurantSettings.restaurantId, restaurant.id));
    await tx
      .insert(restaurantMembers)
      .values({ restaurantId: restaurant.id, userId: staff.id, role: "staff" });

    await tx.insert(diningTables).values(
      Array.from({ length: 20 }, (_, i) => ({
        restaurantId: restaurant.id,
        label: String(i + 1),
        number: i + 1,
        capacity: i < 12 ? 4 : 2,
        zone: i < 14 ? "Salle" : "Terrasse",
        qrToken: randomToken(),
        sortOrder: i,
      })),
    );

    const rates = await tx.select().from(taxRates).where(eq(taxRates.restaurantId, restaurant.id));
    const rate10 = rates.find((r) => r.rateBps === 1000)!;

    // Option groups (reusable across products).
    const [side] = await tx
      .insert(optionGroups)
      .values({ restaurantId: restaurant.id, name: "همراه", minSelect: 1, maxSelect: 1 })
      .returning();
    const [extras] = await tx
      .insert(optionGroups)
      .values({ restaurantId: restaurant.id, name: "افزودنی", minSelect: 0, maxSelect: 4 })
      .returning();
    const [skewer] = await tx
      .insert(optionGroups)
      .values({ restaurantId: restaurant.id, name: "سیخ اضافه", minSelect: 0, maxSelect: 1 })
      .returning();
    await tx.insert(optionValues).values([
      ...["برنج ایرانی", "نان تازه", "نیمی برنج، نیمی نان"].map((name, i) => ({
        restaurantId: restaurant.id,
        groupId: side!.id,
        name,
        sortOrder: i,
        isDefault: i === 0,
      })),
      ...(
        [
          ["ته‌دیگ", 60_000],
          ["گوجه کبابی اضافه", 30_000],
          ["کره", 20_000],
          ["سبزی خوردن", 40_000],
        ] as const
      ).map(([name, delta], i) => ({
        restaurantId: restaurant.id,
        groupId: extras!.id,
        name,
        priceDeltaCents: toman(delta),
        sortOrder: i,
      })),
      {
        restaurantId: restaurant.id,
        groupId: skewer!.id,
        name: "یک سیخ کوبیده",
        priceDeltaCents: toman(180_000),
        sortOrder: 0,
      },
    ]);
    const groupByKey = { side: side!.id, extras: extras!.id, skewer: skewer!.id };

    for (const [ci, cat] of MENU.entries()) {
      const [category] = await tx
        .insert(categories)
        .values({ restaurantId: restaurant.id, name: cat.name, templateKey: cat.key, sortOrder: ci })
        .returning();
      for (const [pi, item] of cat.items.entries()) {
        const [product] = await tx
          .insert(products)
          .values({
            restaurantId: restaurant.id,
            categoryId: category!.id,
            name: item.name,
            description: item.description || null,
            priceCents: toman(item.price),
            taxRateId: rate10.id,
            ingredients: item.ingredients,
            allergens: item.allergens ?? [],
            caloriesKcal: item.kcal,
            weightGrams: item.weight,
            isFeatured: item.featured ?? false,
            tags: item.tags ?? [],
            sortOrder: pi,
          })
          .returning();
        for (const [gi, key] of (item.options ?? []).entries()) {
          await tx.insert(productOptionGroups).values({
            restaurantId: restaurant.id,
            productId: product!.id,
            groupId: groupByKey[key],
            sortOrder: gi,
          });
        }
      }
    }
    console.log(
      `✓ demo restaurant ${restaurant.id}: 20 tables, ${MENU.length} categories, ${MENU.reduce((n, c) => n + c.items.length, 0)} products`,
    );
  });
  console.log(`  owner: ${DEMO_OWNER.email} / ${DEMO_OWNER.password}`);
  console.log(`  staff: ${DEMO_STAFF.email} / ${DEMO_STAFF.password}`);
}

/** The demo runs on Professional so its 20 tables fit the plan limits. */
async function ensureDemoPlan() {
  const [demo] = await db.select().from(restaurants).where(eq(restaurants.slug, "restaurant-demo"));
  const [pro] = await db.select().from(plans).where(eq(plans.code, "professional"));
  if (!demo || !pro) return;
  const updated = await db
    .update(subscriptions)
    .set({ planId: pro.id, status: "active" })
    .where(eq(subscriptions.organizationId, demo.organizationId))
    .returning({ id: subscriptions.id });
  if (updated.length === 0) {
    await db
      .insert(subscriptions)
      .values({ organizationId: demo.organizationId, planId: pro.id, status: "active" });
  }
  console.log("✓ demo organization on the Professional plan");
}

const PALETTE: Record<string, [string, string]> = {
  starters: ["#f4a261", "#e76f51"],
  salads: ["#8ac926", "#2a9d8f"],
  mains: ["#e9c46a", "#d62828"],
  steak: ["#9d0208", "#370617"],
  pasta: ["#ffb703", "#fb8500"],
  desserts: ["#ffafcc", "#cdb4db"],
  coffee: ["#7f5539", "#3e2723"],
  soft_drinks: ["#48cae4", "#0077b6"],
  soups: ["#e9c46a", "#bc6c25"],
  meat: ["#c1121f", "#780000"],
  tea: ["#b5651d", "#5c2e0e"],
};

const escapeXml = (v: string) => v.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Placeholder photo for demo products, processed by the same pipeline as real uploads. */
async function placeholderPhoto(name: string, key: string) {
  const [a, b] = PALETTE[key] ?? ["#adb5bd", "#495057"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="1200" height="900" fill="url(#g)"/>
    <circle cx="600" cy="400" r="230" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="28"/>
    <circle cx="600" cy="400" r="150" fill="rgba(255,255,255,0.18)"/>
    <text x="600" y="780" font-family="DejaVu Sans, sans-serif" font-size="64" font-weight="700" fill="white" text-anchor="middle">${escapeXml(name)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function seedDemoImages() {
  const [demo] = await db.select().from(restaurants).where(eq(restaurants.slug, "restaurant-demo"));
  if (!demo) return;
  const rows = await db
    .select({ id: products.id, name: products.name, key: categories.templateKey })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.restaurantId, demo.id), isNull(products.deletedAt)));
  const [owner] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${DEMO_OWNER.email}`);
  const ctx = await loadRestaurantContext(db, { ...owner!, locale: owner!.locale }, demo.id);
  let added = 0;
  for (const p of rows) {
    const [has] = await db
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, p.id))
      .limit(1);
    if (has) continue;
    await addProductImage(db, ctx, p.id, await placeholderPhoto(p.name, p.key ?? ""));
    added++;
  }
  console.log(`✓ demo product photos: ${added} generated (${rows.length - added} already present)`);
}

/**
 * Demo service in progress, created through the real flow (scan → cart → order → kitchen),
 * so amounts come from the same pricing code as production.
 */
async function seedDemoOrders() {
  const [demo] = await db.select().from(restaurants).where(eq(restaurants.slug, "restaurant-demo"));
  if (!demo) return;
  const [existing] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.restaurantId, demo.id))
    .limit(1);
  if (existing) {
    console.log("✓ demo orders already present — skipping");
    return;
  }
  const [owner] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${DEMO_OWNER.email}`);
  const ctx = await loadRestaurantContext(db, owner!, demo.id);
  const menu = await loadPublicMenu(db, demo.id);
  const byName = (name: string) => Object.values(menu.products).find((p) => p.name === name)!;
  const opt = (product: string, group: string, value: string) =>
    byName(product)
      .optionGroups.find((g) => g.name === group)!
      .values.find((v) => v.name === value)!.id;
  const tables = await db.select().from(diningTables).where(eq(diningTables.restaurantId, demo.id));
  const tableToken = (label: string) => tables.find((t) => t.label === label)!.qrToken;

  type Line = { product: string; options?: [string, string][]; quantity?: number; note?: string };
  async function guestOrders(table: string, lines: Line[], status: OrderStatus, name?: string) {
    const guestId = randomUUID();
    const entry = await enterTableByQr(db, tableToken(table), guestId);
    const guest = (await loadGuestContext(db, guestId, entry!.participant.id))!;
    if (name) await renameParticipant(db, guest, name);
    for (const l of lines) {
      await addToCart(db, guest, {
        productId: byName(l.product).id,
        optionValueIds: (l.options ?? []).map(([g, v]) => opt(l.product, g, v)),
        quantity: l.quantity ?? 1,
        note: l.note,
      });
    }
    const order = await placeOrder(db, guest);
    if (status !== "received") await updateOrderStatus(db, ctx, order.id, status);
    return order;
  }

  // Table 8 — three guests ordering separately (spec §12).
  await guestOrders(
    "8",
    [{ product: "چلوکباب کوبیده", options: [["همراه", "برنج ایرانی"]] }, { product: "دوغ محلی" }],
    "preparing",
    "سارا",
  );
  await guestOrders(
    "8",
    [
      {
        product: "کباب برگ",
        options: [
          ["همراه", "برنج ایرانی"],
          ["افزودنی", "ته‌دیگ"],
        ],
        note: "بدون پیاز",
      },
      { product: "چای ایرانی" },
    ],
    "accepted",
  );
  await guestOrders("8", [{ product: "زرشک پلو با مرغ" }, { product: "شربت سکنجبین" }], "received");
  // Table 4 — already served, Table 12 — ready to go.
  const paidAtTable4 = await guestOrders(
    "4",
    [
      { product: "قورمه سبزی", quantity: 2 },
      { product: "دوغ محلی", quantity: 2 },
    ],
    "served",
  );
  await guestOrders("4", [{ product: "بستنی سنتی" }, { product: "چای ایرانی" }], "served");
  await guestOrders(
    "12",
    [{ product: "جوجه کباب", options: [["همراه", "نان تازه"]] }, { product: "آب معدنی" }],
    "ready",
  );
  // The first guest of table 4 already paid in cash.
  await recordStaffPayment(db, ctx, {
    tableSessionId: paidAtTable4.tableSessionId!,
    participantId: paidAtTable4.participantId!,
    provider: "cash",
    idempotencyKey: newIdempotencyKey(),
  });
  console.log("✓ demo orders: 6 orders on tables 4, 8 (3 guests) and 12, one cash payment");
}

async function main() {
  await seedPlatform();
  // Production containers run this on every start with SEED_DEMO unset: platform data only.
  const demo = process.env.SEED_DEMO ?? (process.env.NODE_ENV === "production" ? "false" : "true");
  if (demo !== "true") return;
  await seedDemoRestaurant();
  await ensureDemoPlan();
  await seedDemoImages();
  await seedDemoOrders();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
