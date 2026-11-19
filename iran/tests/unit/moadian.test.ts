import {
  createDecipheriv,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  constants,
  verify,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import { jwe, jws } from "@/server/modules/moadian/jose";
import { moadianInvoice } from "@/server/modules/moadian/invoice";
import { memoryIdDigits, taxId, verhoeff, verhoeffValid } from "@/server/modules/moadian/taxid";
import type { InvoiceSnapshot } from "@/server/db/schema";

const keys = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

describe("tax id", () => {
  it("computes Verhoeff check digits", () => {
    expect(verhoeff("236")).toBe("3");
    expect(verhoeffValid("2363")).toBe(true);
    expect(verhoeffValid("2364")).toBe(false);
  });
  it("builds the 22-character tax id: memory id, day, serial, check digit", () => {
    const id = taxId("a1b2c3", new Date("2026-11-19T10:00:00Z"), 1048);
    expect(id).toHaveLength(22);
    expect(id.slice(0, 6)).toBe("A1B2C3");
    expect(parseInt(id.slice(6, 11), 16)).toBe(Math.floor(Date.parse("2026-11-19T10:00:00Z") / 86_400_000));
    expect(parseInt(id.slice(11, 21), 16)).toBe(1048);
    const days = String(Math.floor(Date.parse("2026-11-19T10:00:00Z") / 86_400_000)).padStart(6, "0");
    expect(verhoeffValid(memoryIdDigits("A1B2C3") + days + "000000001048" + id.slice(21))).toBe(true);
    expect(() => taxId("bad", new Date(), 1)).toThrow();
  });
});

describe("invoice format", () => {
  const snapshot: InvoiceSnapshot = {
    version: 2,
    seller: { name: "Kafe", tradeName: "Kafe" },
    buyer: null,
    tableLabel: null,
    orders: [],
    lines: [
      {
        name: "Kebab",
        options: [],
        quantity: 2,
        unitPriceCents: 1_100_000,
        lineTotalCents: 2_200_000,
        taxRateBps: 1000,
      },
      {
        name: "Doogh",
        options: ["Large"],
        quantity: 1,
        unitPriceCents: 220_000,
        lineTotalCents: 220_000,
        taxRateBps: 1000,
      },
    ],
    pricesIncludeTax: true,
    taxes: [{ rateBps: 1000, baseCents: 2_200_000, taxCents: 220_000 }],
    subtotalCents: 2_420_000,
    discountCents: 0,
    taxCents: 220_000,
    totalCents: 2_420_000,
    currency: "IRR",
    payments: [],
    notes: null,
  };
  it("writes a retail (type 2) invoice in rials, VAT on the net amount", () => {
    const inv = moadianInvoice(
      { issuedAt: new Date("2026-11-19T10:00:00Z"), serial: 7, snapshot },
      { memoryId: "A1B2C3", sellerId: "10100000000", serviceId: "1234567890123", unitCode: "1627" },
    );
    expect(inv.header).toMatchObject({
      inty: 2,
      inp: 1,
      ins: 1,
      tins: "10100000000",
      tprdis: 22_000,
      tvam: 2_200,
      tbill: 24_200,
      inno: "0000000007",
    });
    expect(inv.body[0]).toMatchObject({
      am: 2,
      fee: 10_000,
      prdis: 20_000,
      vra: 10,
      vam: 2_000,
      tsstam: 22_000,
    });
    expect(inv.body[1]!.sstt).toBe("Doogh - Large");
    const b2b = moadianInvoice(
      {
        issuedAt: new Date(),
        serial: 8,
        snapshot: { ...snapshot, buyer: { name: "Co", nationalId: "10320000000" } },
      },
      { memoryId: "A1B2C3", sellerId: "10100000000", serviceId: "1234567890123", unitCode: "1627" },
    );
    expect(b2b.header).toMatchObject({ inty: 1, tob: 2, bid: "10320000000" });
  });
});

describe("signature and encryption", () => {
  it("signs with RS256 and encrypts for the tax system's key", () => {
    const taxpayer = keys();
    const server = keys();
    const signed = jws({ a: 1 }, taxpayer.privateKey);
    const [h, p, sig] = signed.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toMatchObject({
      alg: "RS256",
      crit: ["sigT"],
    });
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${h}.${p}`),
        createPublicKey(taxpayer.publicKey),
        Buffer.from(sig!, "base64url"),
      ),
    ).toBe(true);

    const token = jwe(signed, server.publicKey, "key-1");
    const [eh, ek, iv, ct, tag] = token.split(".");
    expect(JSON.parse(Buffer.from(eh!, "base64url").toString())).toEqual({
      alg: "RSA-OAEP-256",
      enc: "A256GCM",
      kid: "key-1",
    });
    const cek = privateDecrypt(
      { key: server.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      Buffer.from(ek!, "base64url"),
    );
    const d = createDecipheriv("aes-256-gcm", cek, Buffer.from(iv!, "base64url"));
    d.setAAD(Buffer.from(eh!));
    d.setAuthTag(Buffer.from(tag!, "base64url"));
    const plain = Buffer.concat([d.update(Buffer.from(ct!, "base64url")), d.final()]).toString();
    expect(plain).toBe(signed);
  });
});
