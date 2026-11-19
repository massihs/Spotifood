import { createPrivateKey } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  invoices,
  moadianInvoices,
  restaurantSettings,
  restaurants,
  type MoadianSettings,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { validation } from "@/server/errors";
import { open, seal } from "@/server/infra/secret-box";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { moadianClient, MOADIAN_URLS } from "./client";
import { moadianInvoice } from "./invoice";
import { MEMORY_ID, taxId } from "./taxid";

/**
 * Electronic invoices for the tax system (سامانه مؤدیان). Every invoice issued after the switch-on
 * is queued with its tax id; in "direct" mode Spotifood signs and sends them with the restaurant's
 * key and checks their status; in "provider" mode they are exported for the trusted provider
 * (شرکت معتمد) the restaurant works with. Nothing is ever sent twice.
 */

const PURPOSE_KEY = "moadian-key";
const PURPOSE_CERT = "moadian-cert";
const BATCH = 50;

export const moadianSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["direct", "provider"]),
  sandbox: z.boolean(),
  memoryId: z.string().trim().toUpperCase().regex(MEMORY_ID, "invalid_memory_id"),
  sellerId: z
    .string()
    .trim()
    .regex(/^\d{10,14}$/, "invalid_seller_id"),
  serviceId: z
    .string()
    .trim()
    .regex(/^\d{13}$/, "invalid_service_id"),
  unitCode: z
    .string()
    .trim()
    .regex(/^\d{3,6}$/, "invalid_unit_code"),
  /** Empty: keep the key already saved. */
  privateKey: z.string().trim().max(10_000).default(""),
  certificate: z.string().trim().max(20_000).default(""),
});

export async function getMoadian(db: DbOrTx, restaurantId: string) {
  const [row] = await db
    .select({ m: restaurantSettings.moadian })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));
  return row?.m ?? null;
}

/** The settings as the form shows them: never the key itself, only whether one is saved. */
export async function moadianView(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "accounting.manage");
  const m = await getMoadian(db, ctx.restaurant.id);
  return {
    enabled: m?.enabled ?? false,
    mode: m?.mode ?? "provider",
    sandbox: m?.sandbox ?? true,
    memoryId: m?.memoryId ?? "",
    sellerId: m?.sellerId ?? "",
    serviceId: m?.serviceId ?? "",
    unitCode: m?.unitCode ?? "1627",
    hasKey: !!m?.keySealed,
    hasCert: !!m?.certSealed,
    since: m?.since ?? null,
  };
}

export async function saveMoadian(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "restaurant.manage");
  const input = moadianSchema.parse(raw);
  const current = await getMoadian(db, ctx.restaurant.id);
  if (input.privateKey) {
    try {
      createPrivateKey(input.privateKey);
    } catch {
      throw validation("invalid_private_key", { field: "privateKey" });
    }
  }
  const keySealed = input.privateKey ? seal(input.privateKey, PURPOSE_KEY) : (current?.keySealed ?? null);
  const certSealed = input.certificate
    ? seal(input.certificate, PURPOSE_CERT)
    : (current?.certSealed ?? null);
  if (input.enabled && input.mode === "direct" && !keySealed)
    throw validation("private_key_required", { field: "privateKey" });
  const next: MoadianSettings = {
    enabled: input.enabled,
    mode: input.mode,
    sandbox: input.sandbox,
    memoryId: input.memoryId,
    sellerId: input.sellerId,
    serviceId: input.serviceId,
    unitCode: input.unitCode,
    keySealed,
    certSealed,
    // Switched on now: invoices from this moment on (switching off and on keeps the first date).
    since: current?.since && current.enabled ? current.since : new Date().toISOString(),
  };
  await db
    .update(restaurantSettings)
    .set({ moadian: next })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "tax.moadian_settings",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: {
      enabled: next.enabled,
      mode: next.mode,
      sandbox: next.sandbox,
      keyChanged: !!input.privateKey,
    },
  });
}

/** Puts the invoices issued since the switch-on in the queue, each with its tax id. */
export async function queueInvoices(db: DbOrTx, restaurantId: string, m: MoadianSettings) {
  const fresh = await db
    .select({ id: invoices.id, seq: invoices.seq, issuedAt: invoices.issuedAt })
    .from(invoices)
    .leftJoin(moadianInvoices, eq(moadianInvoices.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.restaurantId, restaurantId),
        gte(invoices.issuedAt, new Date(m.since)),
        isNull(moadianInvoices.id),
      ),
    )
    .orderBy(asc(invoices.seq))
    .limit(500);
  if (!fresh.length) return 0;
  await db
    .insert(moadianInvoices)
    .values(
      fresh.map((i) => ({
        restaurantId,
        invoiceId: i.id,
        serial: i.seq,
        taxId: taxId(m.memoryId, i.issuedAt, i.seq),
      })),
    )
    .onConflictDoNothing();
  return fresh.length;
}

/**
 * Queues, sends and checks the invoices of every restaurant sending directly. Called by the
 * periodic job; a restaurant whose sending fails is retried at the next run (at most 5 times
 * per invoice, then it waits for someone to look).
 */
export async function syncMoadian(db: Database, only?: string, f: typeof fetch = fetch) {
  const rows = await db
    .select({ id: restaurants.id, m: restaurantSettings.moadian })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(
      and(
        isNull(restaurants.deletedAt),
        isNotNull(restaurantSettings.moadian),
        sql`(${restaurantSettings.moadian}->>'enabled')::boolean is true`,
        only ? eq(restaurants.id, only) : undefined,
      ),
    );
  const out = { queued: 0, sent: 0, accepted: 0, failed: 0 };
  for (const r of rows) {
    const m = r.m!;
    out.queued += await queueInvoices(db, r.id, m);
    if (m.mode !== "direct" || !m.keySealed) continue;
    const client = moadianClient(
      {
        baseUrl: m.sandbox ? MOADIAN_URLS.sandbox : MOADIAN_URLS.production,
        memoryId: m.memoryId,
        privateKeyPem: open(m.keySealed, PURPOSE_KEY),
        certPem: m.certSealed ? open(m.certSealed, PURPOSE_CERT) : null,
      },
      f,
    );
    try {
      // 1. Send what is waiting.
      const pending = await db
        .select({ q: moadianInvoices, issuedAt: invoices.issuedAt, snapshot: invoices.snapshot })
        .from(moadianInvoices)
        .innerJoin(invoices, eq(invoices.id, moadianInvoices.invoiceId))
        .where(
          and(
            eq(moadianInvoices.restaurantId, r.id),
            eq(moadianInvoices.status, "pending"),
            lte(moadianInvoices.attempts, 4),
          ),
        )
        .orderBy(asc(moadianInvoices.serial))
        .limit(BATCH);
      if (pending.length) {
        const res = await client.send(
          pending.map((p) => ({
            uid: p.q.id,
            invoice: moadianInvoice({ issuedAt: p.issuedAt, serial: p.q.serial, snapshot: p.snapshot }, m),
          })),
        );
        for (const p of pending) {
          const a = res.find((x) => x.uid === p.q.id);
          await db
            .update(moadianInvoices)
            .set(
              a?.referenceNumber
                ? {
                    status: "sent",
                    referenceNumber: a.referenceNumber,
                    error: null,
                    sentAt: new Date(),
                    attempts: p.q.attempts + 1,
                  }
                : { error: a?.error ?? "no_answer", attempts: p.q.attempts + 1 },
            )
            .where(eq(moadianInvoices.id, p.q.id));
          if (a?.referenceNumber) out.sent++;
        }
      }
      // 2. Ask about those sent.
      const sent = await db
        .select({ id: moadianInvoices.id, ref: moadianInvoices.referenceNumber })
        .from(moadianInvoices)
        .where(and(eq(moadianInvoices.restaurantId, r.id), eq(moadianInvoices.status, "sent")))
        .limit(BATCH);
      const answers = await client.inquiry(sent.map((s) => s.ref!).filter(Boolean));
      for (const a of answers) {
        if (a.status === "PENDING") continue;
        const s = sent.find((x) => x.ref === a.referenceNumber);
        if (!s) continue;
        await db
          .update(moadianInvoices)
          .set({
            status: a.status === "SUCCESS" ? "accepted" : "failed",
            error: a.error,
            checkedAt: new Date(),
          })
          .where(eq(moadianInvoices.id, s.id));
        if (a.status === "SUCCESS") out.accepted++;
        else out.failed++;
      }
    } catch (e) {
      console.error("[moadian]", r.id, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

/** A refused invoice corrected (settings, key): back in the queue. */
export async function retryMoadian(db: Database, ctx: RestaurantContext, ids: string[]) {
  assertCan(ctx, "accounting.manage");
  if (!ids.length) return;
  await db
    .update(moadianInvoices)
    .set({ status: "pending", attempts: 0, error: null, referenceNumber: null })
    .where(
      and(
        eq(moadianInvoices.restaurantId, ctx.restaurant.id),
        inArray(moadianInvoices.id, ids),
        inArray(moadianInvoices.status, ["failed", "pending"]),
      ),
    );
}

export async function moadianStatus(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const [counts, recent] = await Promise.all([
    db
      .select({ status: moadianInvoices.status, n: count() })
      .from(moadianInvoices)
      .where(eq(moadianInvoices.restaurantId, rid))
      .groupBy(moadianInvoices.status),
    db
      .select({
        id: moadianInvoices.id,
        number: invoices.number,
        totalCents: invoices.totalCents,
        issuedAt: invoices.issuedAt,
        taxId: moadianInvoices.taxId,
        status: moadianInvoices.status,
        referenceNumber: moadianInvoices.referenceNumber,
        error: moadianInvoices.error,
        attempts: moadianInvoices.attempts,
      })
      .from(moadianInvoices)
      .innerJoin(invoices, eq(invoices.id, moadianInvoices.invoiceId))
      .where(eq(moadianInvoices.restaurantId, rid))
      .orderBy(desc(moadianInvoices.serial))
      .limit(100),
  ]);
  const by = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  return { pending: by("pending"), sent: by("sent"), accepted: by("accepted"), failed: by("failed"), recent };
}

/** The period's invoices in the tax system's JSON, for a trusted provider (شرکت معتمد). */
export async function exportForProvider(db: DbOrTx, ctx: RestaurantContext, from: Date, to: Date) {
  assertCan(ctx, "accounting.manage");
  const m = await getMoadian(db, ctx.restaurant.id);
  if (!m) throw validation("moadian_not_set");
  await queueInvoices(db, ctx.restaurant.id, m);
  const rows = await db
    .select({
      serial: moadianInvoices.serial,
      issuedAt: invoices.issuedAt,
      snapshot: invoices.snapshot,
      number: invoices.number,
    })
    .from(moadianInvoices)
    .innerJoin(invoices, eq(invoices.id, moadianInvoices.invoiceId))
    .where(
      and(
        eq(moadianInvoices.restaurantId, ctx.restaurant.id),
        gte(invoices.issuedAt, from),
        lte(invoices.issuedAt, to),
      ),
    )
    .orderBy(asc(moadianInvoices.serial));
  return rows.map((r) => ({
    number: r.number,
    ...moadianInvoice({ issuedAt: r.issuedAt, serial: r.serial, snapshot: r.snapshot }, m),
  }));
}
