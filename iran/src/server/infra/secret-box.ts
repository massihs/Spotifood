import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption at rest for small secrets (bank account numbers). AES-256-GCM with a key derived
 * from APP_SECRET, which never changes in production: a database dump or backup alone does not
 * reveal them. Format: "v1:" + base64(iv 12 B | tag 16 B | ciphertext).
 */
const VERSION = "v1";

function key(purpose: string) {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) throw new Error("APP_SECRET must be set (32+ chars)");
  return createHash("sha256").update(`spotifood:${purpose}:${secret}`).digest();
}

export function seal(plain: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}

export function open(sealed: string, purpose: string): string {
  const [version, body] = sealed.split(":");
  if (version !== VERSION || !body) throw new Error("secret_box_format");
  const raw = Buffer.from(body, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(purpose), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
