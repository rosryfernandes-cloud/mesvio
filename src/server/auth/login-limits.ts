import "server-only";
import { createHash } from "node:crypto";
import type { Db } from "@/server/db/client";
import { hitRateLimit, type RateLimitResult } from "@/server/security/rate-limit";

/** Limites de entrada no painel (além dos da própria Supabase): por rede e por email. */
export const LOGIN_LIMITS = {
  perIp: { limit: 10, windowSeconds: 15 * 60 },
  perEmail: { limit: 5, windowSeconds: 15 * 60 },
};

const emailKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("base64url").slice(0, 22);

export async function checkLoginLimits(db: Db, kind: "code" | "verify", ipHash: string, email: string): Promise<RateLimitResult> {
  const ip = await hitRateLimit(db, `login:${kind}:ip:${ipHash}`, LOGIN_LIMITS.perIp);
  if (!ip.allowed) return ip;
  return hitRateLimit(db, `login:${kind}:email:${emailKey(email)}`, LOGIN_LIMITS.perEmail);
}
