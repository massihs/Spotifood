import { generateKeyPairSync, randomBytes } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { moadianInvoices } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import {
  exportForProvider,
  moadianStatus,
  moadianView,
  saveMoadian,
  syncMoadian,
} from "@/server/modules/moadian/service";
import { accountantPack } from "@/server/modules/moadian/pack";
import { syncLedger } from "@/server/modules/ledger/sync";
import { createOwnerWithRestaurant } from "../helpers/factories";

const pair = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

describe("tax system (مؤدیان)", () => {
  it("queues the invoices issued after the switch-on, sends them once and records the answer", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Mo'adian", { plan: "professional" });
    const cat = await createCategory(db, ctx, { name: "Plats" });
    const dish = await createProduct(db, ctx, { categoryId: cat.id, name: "Kebab", priceCents: 1_100_000 });
    const sale = () =>
      createPosOrder(db, ctx, {
        lines: [{ productId: dish.id, quantity: 1 }],
        payment: { provider: "cash", tenderedCents: 1_100_000 },
        idempotencyKey: randomBytes(8).toString("hex"),
      });
    await sale(); // before the switch-on: not sent
    const taxpayer = pair();
    await expect(
      saveMoadian(db, ctx, {
        enabled: true,
        mode: "direct",
        sandbox: true,
        memoryId: "A1B2C3",
        sellerId: "10100000000",
        serviceId: "1234567890123",
        unitCode: "1627",
      }),
    ).rejects.toThrow(/private_key_required/);
    await saveMoadian(db, ctx, {
      enabled: true,
      mode: "direct",
      sandbox: true,
      memoryId: "a1b2c3",
      sellerId: "10100000000",
      serviceId: "1234567890123",
      unitCode: "1627",
      privateKey: taxpayer.privateKey,
    });
    expect(await moadianView(db, ctx)).toMatchObject({ enabled: true, hasKey: true, memoryId: "A1B2C3" });
    await sale();
    await sale();

    const server = pair();
    const calls: string[] = [];
    const fake: typeof fetch = async (input, init) => {
      const u = String(input);
      calls.push(`${init?.method ?? "GET"} ${u.replace(/^.*\/api\/v2\//, "")}`);
      if (u.includes("nonce")) return Response.json({ nonce: "n-1" });
      if (u.includes("server-information"))
        return Response.json({ publicKeys: [{ key: server.publicKey, id: "k1" }] });
      if (u.endsWith("/invoice")) {
        const body = JSON.parse(String(init?.body)) as { header: { requestTraceId: string } }[];
        return Response.json({
          result: body.map((b, i) => ({ uid: b.header.requestTraceId, referenceNumber: `ref-${i}` })),
        });
      }
      if (u.includes("inquiry"))
        return Response.json([
          { referenceNumber: "ref-0", status: "SUCCESS" },
          { referenceNumber: "ref-1", status: "FAILED", data: { error: [{ code: "X1", message: "bad" }] } },
        ]);
      return new Response("?", { status: 404 });
    };
    const res = await syncMoadian(db, restaurant.id, fake);
    expect(res).toMatchObject({ queued: 2, sent: 2, accepted: 1, failed: 1 });
    expect(calls.filter((c) => c.startsWith("POST")).length).toBe(1);

    const again = await syncMoadian(db, restaurant.id, fake);
    expect(again).toMatchObject({ queued: 0, sent: 0 });
    const status = await moadianStatus(db, ctx);
    expect(status).toMatchObject({ accepted: 1, failed: 1, pending: 0 });
    const rows = await db
      .select()
      .from(moadianInvoices)
      .where(eq(moadianInvoices.restaurantId, restaurant.id));
    expect(rows.every((r) => r.taxId.startsWith("A1B2C3") && r.taxId.length === 22)).toBe(true);

    const exported = await exportForProvider(
      db,
      ctx,
      new Date(Date.now() - 3_600_000),
      new Date(Date.now() + 60_000),
    );
    expect(exported).toHaveLength(2);
    expect(exported[0]!.header.tbill).toBe(11_000);
  });

  it("packs the books for the accountant", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Pack", { plan: "professional" });
    const cat = await createCategory(db, ctx, { name: "Plats" });
    const dish = await createProduct(db, ctx, { categoryId: cat.id, name: "Kebab", priceCents: 50_000 });
    await createPosOrder(db, ctx, {
      lines: [{ productId: dish.id, quantity: 1 }],
      payment: { provider: "cash", tenderedCents: 50_000 },
      idempotencyKey: randomBytes(8).toString("hex"),
    });
    await syncLedger(db, ctx.restaurant);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: restaurant.timezone }).format(new Date());
    const files = unzipSync(await accountantPack(db, ctx, today, today));
    const names = Object.keys(files);
    expect(names).toHaveLength(4);
    const invoicesCsv = strFromU8(files[names.find((n) => n.startsWith("4-"))!]!);
    expect(invoicesCsv.split("\r\n")).toHaveLength(2);
  });
});
