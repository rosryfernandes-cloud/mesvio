import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Cookies assinados (HMAC-SHA256) e verificação de origem, usados pelo painel. */

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET em falta ou curta (mín. 32 caracteres).");
  return "dev-only-session-secret-nao-usar-em-producao";
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeSigned(data: Record<string, unknown>, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ ...data, x: expiresAt })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSigned(value: string | undefined, now = Date.now()): Record<string, unknown> | null {
  if (!value) return null;
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof data?.x === "number" && data.x > now ? data : null;
  } catch {
    return null;
  }
}

/**
 * Proteção CSRF para ações do painel: o pedido tem de vir de uma página da própria app.
 * (Os cookies são SameSite=Lax; isto fecha também o caso de subdomínios/navegadores antigos.)
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
