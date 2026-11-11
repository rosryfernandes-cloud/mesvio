import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Autenticação da ZoneSoft (ZSROI) nos nossos endpoints.
 *
 * 1. A ZoneSoft chama o `endpoint_login` com o APP-KEY e o APP-SECRET gerados no portal quando o
 *    cliente (restaurante) foi criado: `{ app_store_username, app_store_secret }`.
 * 2. Devolvemos um token (30 dias) que a ZoneSoft envia no header `Authorization` dos outros pedidos.
 *
 * O token é assinado (HMAC-SHA256) e diz a que restaurante pertence: não é preciso guardá-lo na BD.
 */

export const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Credenciais ZoneSoft de um restaurante, guardadas cifradas em `pos_integrations.credentials_ciphertext`. */
export const zoneSoftCredentialsSchema = z.object({
  /** Serial / licença do cliente ZoneSoft (ex.: D_XXXX). */
  serial: z.string().trim().min(1).max(64),
  /** ID da loja no ZS Rest. */
  storeId: z.string().trim().min(1).max(32),
  /** Client ID do cliente no portal (vai no `store_id` dos pedidos). */
  clientId: z.string().trim().max(128).optional().default(""),
  /** APP-KEY e APP-SECRET do cliente (gerados no portal ao criar o cliente). */
  appKey: z.string().trim().min(8).max(512),
  appSecret: z.string().trim().min(8).max(512),
});
export type ZoneSoftCredentials = z.infer<typeof zoneSoftCredentialsSchema>;

function tokenKey(): Buffer {
  const raw = process.env.PLATFORM_SECRET_KEY;
  if (!raw && process.env.NODE_ENV === "production") throw new Error("PLATFORM_SECRET_KEY em falta.");
  return createHash("sha256").update(`zsroi-token:${raw ?? "mesvio-dev-only"}`).digest();
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const sign = (payload: string) => createHmac("sha256", tokenKey()).update(payload).digest("base64url");

export interface ZsroiTokenClaims {
  establishmentId: string;
  organizationId: string;
}

export function issueToken(claims: ZsroiTokenClaims, now = new Date()): { accessToken: string; expiresIn: number } {
  const payload = b64(JSON.stringify({ e: claims.establishmentId, o: claims.organizationId, x: Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS }));
  return { accessToken: `zs1.${payload}.${sign(payload)}`, expiresIn: TOKEN_TTL_SECONDS };
}

/** Valida o header `Authorization` (com ou sem "Bearer "). */
export function verifyToken(header: string | null, now = new Date()): ZsroiTokenClaims | null {
  const token = header?.replace(/^Bearer\s+/i, "").trim();
  const parts = token?.split(".");
  if (!parts || parts.length !== 3 || parts[0] !== "zs1") return null;
  const [, payload, mac] = parts;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { e, o, x } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { e?: unknown; o?: unknown; x?: unknown };
    if (typeof e !== "string" || typeof o !== "string" || typeof x !== "number") return null;
    if (x * 1000 < now.getTime()) return null;
    return { establishmentId: e, organizationId: o };
  } catch {
    return null;
  }
}

/** Comparação em tempo constante (via hash, para não revelar o tamanho). */
export function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Assinatura dos pedidos que enviamos à ZSROI: HMAC-SHA256 do corpo com o APP-SECRET (hex). */
export function signRequest(body: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(body).digest("hex");
}
