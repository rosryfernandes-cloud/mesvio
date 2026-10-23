import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifra simétrica (AES-256-GCM) para segredos guardados na BD, ex.: segredos 2FA.
 * Formato: base64(iv[12] | tag[16] | texto cifrado). A chave vem de PLATFORM_SECRET_KEY
 * (32 bytes em base64: `openssl rand -base64 32`); em desenvolvimento usa uma chave fixa.
 */
function key(): Buffer {
  const raw = process.env.PLATFORM_SECRET_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("PLATFORM_SECRET_KEY tem de ter 32 bytes em base64.");
    return k;
  }
  if (process.env.NODE_ENV === "production") throw new Error("PLATFORM_SECRET_KEY em falta (openssl rand -base64 32).");
  return createHash("sha256").update("mesvio-dev-only-secret-box").digest();
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function open(sealed: string): string {
  const buf = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
