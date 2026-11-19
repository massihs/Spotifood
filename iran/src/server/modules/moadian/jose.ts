import {
  constants,
  createCipheriv,
  createPrivateKey,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  sign,
} from "node:crypto";

/**
 * The two envelopes the tax system wants around each invoice: signed by the taxpayer (JWS, RS256,
 * with its certificate when it has one), then encrypted for the tax system's public key (JWE,
 * RSA-OAEP-256 + A256GCM). Compact serialisation, standard base64url.
 */

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** The certificate body (no PEM armour), as x5c wants it. */
const certBody = (pem: string) => pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");

export function jws(payload: unknown, privateKeyPem: string, certPem?: string | null, now = new Date()) {
  const header: Record<string, unknown> = {
    alg: "RS256",
    typ: "jose",
    sigT: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    crit: ["sigT"],
  };
  if (certPem) header.x5c = [certBody(certPem)];
  const input = `${b64u(JSON.stringify(header))}.${b64u(typeof payload === "string" ? payload : JSON.stringify(payload))}`;
  const sig = sign("RSA-SHA256", Buffer.from(input), createPrivateKey(privateKeyPem));
  return `${input}.${b64u(sig)}`;
}

export function jwe(plaintext: string, serverPublicKey: string, kid: string) {
  const key = createPublicKey(
    serverPublicKey.includes("BEGIN")
      ? serverPublicKey
      : `-----BEGIN PUBLIC KEY-----\n${serverPublicKey
          .replace(/\s+/g, "")
          .match(/.{1,64}/g)!
          .join("\n")}\n-----END PUBLIC KEY-----`,
  );
  const header = b64u(JSON.stringify({ alg: "RSA-OAEP-256", enc: "A256GCM", kid }));
  const cek = randomBytes(32);
  const iv = randomBytes(12);
  const encryptedKey = publicEncrypt(
    { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    cek,
  );
  const cipher = createCipheriv("aes-256-gcm", cek, iv);
  cipher.setAAD(Buffer.from(header));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${header}.${b64u(encryptedKey)}.${b64u(iv)}.${b64u(ct)}.${b64u(cipher.getAuthTag())}`;
}
