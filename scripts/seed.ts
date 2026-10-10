/**
 * Development seed. Idempotent: safe to run several times.
 *   npm run db:seed
 * Creates plans, global category templates, a super admin and "Restaurant Demo" (20 tables, menu).
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  categories,
  diningTables,
  globalCategoryTemplates,
  optionGroups,
  optionValues,
  plans,
  productOptionGroups,
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

const DEMO_OWNER = {
  email: "owner@demo.spotifood.local",
  password: "DemoOwner!2026",
  fullName: "Alex Martin",
};
const DEMO_STAFF = { email: "staff@demo.spotifood.local", password: "DemoStaff!2026", fullName: "Sam Leroy" };

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
  price: number;
  ingredients?: string;
  allergens?: string[];
  kcal?: number;
  weight?: number;
  featured?: boolean;
  tags?: string[];
  options?: ("cuisson" | "supplements" | "sauce")[];
  alcohol?: boolean;
};

const MENU: { key: string; name: string; items: DemoProduct[] }[] = [
  {
    key: "starters",
    name: "Entrées",
    items: [
      {
        name: "Burrata crémeuse",
        description: "Tomates anciennes, basilic, huile d'olive vierge.",
        price: 1250,
        ingredients: "Burrata, tomates, basilic, huile d'olive",
        allergens: ["milk"],
        kcal: 420,
        weight: 200,
        featured: true,
        tags: ["vegetarian"],
      },
      {
        name: "Carpaccio de bœuf",
        description: "Parmesan, roquette, câpres.",
        price: 1350,
        allergens: ["milk"],
        kcal: 310,
      },
      {
        name: "Soupe à l'oignon",
        description: "Gratinée au comté.",
        price: 900,
        allergens: ["gluten", "milk"],
        kcal: 380,
      },
    ],
  },
  {
    key: "salads",
    name: "Salades",
    items: [
      {
        name: "César au poulet",
        description: "Poulet grillé, croûtons, parmesan, sauce César.",
        price: 1590,
        allergens: ["gluten", "eggs", "milk", "fish"],
        kcal: 640,
      },
      {
        name: "Salade de chèvre chaud",
        description: "Toasts de chèvre, miel, noix.",
        price: 1490,
        allergens: ["gluten", "milk", "nuts"],
        kcal: 580,
        tags: ["vegetarian"],
      },
    ],
  },
  {
    key: "mains",
    name: "Plats",
    items: [
      {
        name: "Burger signature",
        description: "Bœuf 180 g, cheddar affiné, oignons confits, frites maison.",
        price: 1990,
        allergens: ["gluten", "milk", "mustard", "sesame"],
        kcal: 980,
        featured: true,
        options: ["cuisson", "supplements"],
      },
      {
        name: "Saumon rôti",
        description: "Purée de patate douce, beurre citronné.",
        price: 2290,
        allergens: ["fish", "milk"],
        kcal: 720,
      },
      {
        name: "Risotto aux champignons",
        description: "Arborio, cèpes, parmesan.",
        price: 1890,
        allergens: ["milk"],
        kcal: 690,
        tags: ["vegetarian"],
      },
    ],
  },
  {
    key: "steak",
    name: "Steak",
    items: [
      {
        name: "Entrecôte 300 g",
        description: "Race normande, frites maison, salade.",
        price: 3200,
        weight: 300,
        kcal: 1050,
        featured: true,
        options: ["cuisson", "sauce", "supplements"],
      },
      {
        name: "Tartare de bœuf",
        description: "Préparé minute, frites.",
        price: 1950,
        allergens: ["eggs", "mustard"],
        kcal: 760,
      },
    ],
  },
  {
    key: "pasta",
    name: "Pâtes",
    items: [
      {
        name: "Tagliatelles carbonara",
        description: "Guanciale, pecorino, jaune d'œuf.",
        price: 1690,
        allergens: ["gluten", "eggs", "milk"],
        kcal: 850,
      },
      {
        name: "Penne all'arrabbiata",
        description: "Tomate, piment, ail.",
        price: 1450,
        allergens: ["gluten"],
        kcal: 620,
        tags: ["vegan", "spicy"],
      },
    ],
  },
  {
    key: "desserts",
    name: "Desserts",
    items: [
      {
        name: "Cheesecake",
        description: "Coulis de fruits rouges.",
        price: 850,
        allergens: ["gluten", "milk", "eggs"],
        kcal: 480,
        featured: true,
      },
      {
        name: "Moelleux au chocolat",
        description: "Cœur coulant, glace vanille.",
        price: 900,
        allergens: ["gluten", "milk", "eggs"],
        kcal: 560,
      },
      {
        name: "Café gourmand",
        description: "Expresso et trois mignardises.",
        price: 950,
        allergens: ["gluten", "milk", "eggs", "nuts"],
      },
    ],
  },
  {
    key: "coffee",
    name: "Café",
    items: [
      { name: "Expresso", description: "", price: 250 },
      { name: "Cappuccino", description: "", price: 450, allergens: ["milk"] },
      { name: "Thé glacé maison", description: "Pêche, menthe.", price: 500 },
    ],
  },
  {
    key: "soft_drinks",
    name: "Boissons",
    items: [
      { name: "Coca-Cola 33 cl", description: "", price: 450 },
      { name: "Eau pétillante 50 cl", description: "", price: 400 },
      { name: "Limonade artisanale", description: "", price: 500 },
      {
        name: "Verre de vin rouge",
        description: "Côtes-du-Rhône, 12 cl.",
        price: 650,
        allergens: ["sulphites"],
        alcohol: true,
      },
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
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? "ChangeMe!2026";
  await upsertUser(email, password, "Platform Admin", true);
  console.log(
    `✓ platform: ${DEFAULT_PLANS.length} plans, ${DEFAULT_CATEGORY_TEMPLATES.length} category templates, super admin ${email}`,
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
      name: "Demo Group",
      ownerUserId: owner.id,
      billingEmail: owner.email,
    });
    const restaurant = await createRestaurant(tx, {
      organizationId: org.id,
      ownerUserId: owner.id,
      name: "Restaurant Demo",
    });
    await tx
      .update(restaurants)
      .set({
        phone: "+33 1 23 45 67 89",
        addressLine1: "12 rue de la Paix",
        city: "Paris",
        postalCode: "75002",
        email: "contact@demo.spotifood.local",
      })
      .where(eq(restaurants.id, restaurant.id));
    await tx
      .update(restaurantSettings)
      .set({ orderPrefix: "D", legalName: "Demo Restauration SAS" })
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
    const rate20 = rates.find((r) => r.rateBps === 2000)!;

    // Option groups (reusable across products).
    const [cuisson] = await tx
      .insert(optionGroups)
      .values({ restaurantId: restaurant.id, name: "Cuisson", minSelect: 1, maxSelect: 1 })
      .returning();
    const [supplements] = await tx
      .insert(optionGroups)
      .values({ restaurantId: restaurant.id, name: "Suppléments", minSelect: 0, maxSelect: 4 })
      .returning();
    const [sauce] = await tx
      .insert(optionGroups)
      .values({ restaurantId: restaurant.id, name: "Sauce", minSelect: 0, maxSelect: 1 })
      .returning();
    await tx.insert(optionValues).values([
      ...["Bleu", "Saignant", "À point", "Bien cuit"].map((name, i) => ({
        restaurantId: restaurant.id,
        groupId: cuisson!.id,
        name,
        sortOrder: i,
        isDefault: name === "À point",
      })),
      ...[
        ["Fromage", 200],
        ["Bacon", 250],
        ["Champignons", 200],
        ["Frites", 300],
      ].map(([name, delta], i) => ({
        restaurantId: restaurant.id,
        groupId: supplements!.id,
        name: String(name),
        priceDeltaCents: Number(delta),
        sortOrder: i,
      })),
      ...[
        ["Poivre", 150],
        ["Béarnaise", 150],
        ["Roquefort", 200],
      ].map(([name, delta], i) => ({
        restaurantId: restaurant.id,
        groupId: sauce!.id,
        name: String(name),
        priceDeltaCents: Number(delta),
        sortOrder: i,
      })),
    ]);
    const groupByKey = { cuisson: cuisson!.id, supplements: supplements!.id, sauce: sauce!.id };

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
            priceCents: item.price,
            taxRateId: item.alcohol ? rate20.id : rate10.id,
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

async function main() {
  await seedPlatform();
  await seedDemoRestaurant();
  await ensureDemoPlan();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
