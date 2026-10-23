import "server-only";
import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { rateLimitBuckets } from "@/server/db/schema";

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

/**
 * Limites dos pedidos. Pensados para uma mesa real (vários pedidos por refeição, várias
 * pessoas) e para travar quem fotografa o QR e faz pedidos de fora ou em massa.
 */
export const ORDER_RATE_LIMITS = {
  /** Por telemóvel/rede: ~1 pedido a cada 30 s em média. */
  perIp: { limit: 10, windowSeconds: 5 * 60 },
  /** Por mesa, somando todos os telemóveis dessa mesa. */
  perTable: { limit: 30, windowSeconds: 15 * 60 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Conta um acesso na janela atual e diz se ainda está dentro do limite. Atómico (upsert). */
export async function hitRateLimit(db: Db, key: string, rule: RateLimitRule, now = new Date()): Promise<RateLimitResult> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimitBuckets)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });
  if (row.count <= rule.limit) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000)) };
}

/** Apaga janelas com mais de um dia. Chamado periodicamente pelo worker. */
export async function pruneRateLimits(db: Db, now = new Date()): Promise<void> {
  await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.windowStart, new Date(now.getTime() - 24 * 3600 * 1000)));
}

/** IP pseudonimizado (RGPD): nunca guardamos o IP em claro. */
export function hashClientIp(ip: string, salt = process.env.IP_HASH_SALT ?? ""): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("base64url").slice(0, 22);
}

/**
 * IP do cliente, lido SÓ do cabeçalho que o proxy de confiança escreve (auditoria S2).
 * Ler vários cabeçalhos por ordem deixava o cliente escolher o seu "IP": na Vercel, um
 * `cf-connecting-ip` enviado pelo cliente chega intacto à app e contornava os limites por IP.
 *
 * TRUSTED_PROXY:
 * - "vercel" (omissão): a Vercel reescreve `x-forwarded-for` com o IP real do cliente.
 * - "cloudflare": Cloudflare à frente; `cf-connecting-ip` é escrito por ela.
 * - "none": sem proxy (dev/rede local); usa `x-forwarded-for` se existir, sem garantias.
 */
export function clientIpFromHeaders(h: Headers, trustedProxy = process.env.TRUSTED_PROXY ?? "vercel"): string {
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  const ip = trustedProxy === "cloudflare" ? first(h.get("cf-connecting-ip")) : first(h.get("x-forwarded-for"));
  return ip ?? "unknown";
}
