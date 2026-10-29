import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { auditLogs, diningTables, establishments, reviews } from "@/server/db/schema";
import { resolveTableToken, withTenant } from "@/server/db/tenant";
import { hitRateLimit } from "@/server/security/rate-limit";
import type { StaffContext } from "@/server/staff/context";
import { currentSession, isOpen, loadBill } from "@/server/tables/table-sessions";
import { isWellFormedTableToken } from "@/server/tables/table-token";

/**
 * Avaliações no fim da conta (em teste, ligadas por restaurante no painel). Depois de pagar, o
 * cliente dá 1–5 estrelas e um comentário opcional, que só o restaurante vê. O botão "Avaliar no
 * Google" aparece a TODOS, seja qual for a nota: mostrá-lo só a quem gostou ("review gating") é
 * proibido pelo Google e pelas regras de defesa do consumidor.
 */
type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

export const reviewInputSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
});

/** Por mesa: várias pessoas da mesma mesa podem avaliar, mas não encher o painel. */
const PER_TABLE = { limit: 8, windowSeconds: 60 * 60 };
const PER_IP = { limit: 30, windowSeconds: 60 * 60 };

const tableKey = (token: string) => createHash("sha256").update(token).digest("base64url").slice(0, 22);

type SubmitResult =
  | { ok: true }
  | { ok: false; code: "INVALID_INPUT" | "TABLE_NOT_FOUND" | "NOT_ALLOWED" | "RATE_LIMITED"; message: string };

/** O cliente (com o QR/NFC da mesa) avalia, depois de a conta estar paga. */
export async function submitReview(db: Db, token: string, raw: unknown, { ipHash, now = new Date() }: { ipHash: string; now?: Date }): Promise<SubmitResult> {
  const parsed = reviewInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Escolha de 1 a 5 estrelas." };
  if (!isWellFormedTableToken(token)) return { ok: false, code: "TABLE_NOT_FOUND", message: "Mesa não encontrada." };
  const t = await resolveTableToken(db, token);
  if (!t) return { ok: false, code: "TABLE_NOT_FOUND", message: "Mesa não encontrada." };

  for (const [key, rule] of [
    [`review:table:${tableKey(token)}`, PER_TABLE],
    [`review:ip:${ipHash}`, PER_IP],
  ] as const) {
    if (!(await hitRateLimit(db, key, rule, now)).allowed) return { ok: false, code: "RATE_LIMITED", message: "Já recebemos a sua avaliação. Obrigado!" };
  }

  return withTenant(db, { organizationId: t.organizationId }, async (tx): Promise<SubmitResult> => {
    const [est] = await tx.select({ enabled: establishments.reviewsEnabled }).from(establishments).where(eq(establishments.id, t.establishmentId));
    if (!est?.enabled) return { ok: false, code: "NOT_ALLOWED", message: "Este restaurante não recebe avaliações pela app." };
    // Só avalia quem está numa conta paga (evita avaliações de quem só leu o QR).
    const session = await currentSession(tx, t.tableId);
    const bill = session && isOpen(session, now) ? await loadBill(tx, t.tableId, now) : null;
    if (!session || !bill || bill.totalCents === 0 || bill.dueCents > 0) {
      return { ok: false, code: "NOT_ALLOWED", message: "Pode avaliar depois de pagar a conta." };
    }
    await tx.insert(reviews).values({
      organizationId: t.organizationId,
      establishmentId: t.establishmentId,
      tableId: t.tableId,
      tableSessionId: session.id,
      stars: parsed.data.stars,
      comment: parsed.data.comment,
    });
    return { ok: true };
  });
}

// ─────────────────────────── Painel ───────────────────────────

const googleUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && /(^|\.)(google\.[a-z.]+|g\.page|goo\.gl)$/.test(u.hostname);
    } catch {
      return false;
    }
  }, "Cole o link de avaliação do Google (começa por https://).")
  .transform((v) => v || null);

const settingsSchema = z.object({ enabled: z.boolean(), googleReviewUrl: googleUrlSchema.optional().default("") });

export interface ReviewsOverview {
  enabled: boolean;
  googleReviewUrl: string | null;
  /** Últimos 90 dias. */
  count: number;
  average: number | null;
  /** Quantas de 1 a 5 estrelas (índice 0 = 1 estrela). */
  distribution: [number, number, number, number, number];
  recent: { id: string; stars: number; comment: string | null; tableLabel: string; createdAt: string }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getReviewsOverview(db: Db, s: Scope, now = new Date()): Promise<ReviewsOverview> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [est] = await tx
      .select({ enabled: establishments.reviewsEnabled, googleReviewUrl: establishments.googleReviewUrl })
      .from(establishments)
      .where(eq(establishments.id, s.establishmentId));
    const rows = await tx
      .select({ id: reviews.id, stars: reviews.stars, comment: reviews.comment, tableLabel: diningTables.label, createdAt: reviews.createdAt })
      .from(reviews)
      .innerJoin(diningTables, eq(diningTables.id, reviews.tableId))
      .where(and(eq(reviews.establishmentId, s.establishmentId), gte(reviews.createdAt, new Date(now.getTime() - 90 * DAY_MS))))
      .orderBy(desc(reviews.createdAt))
      .limit(500);
    const distribution: ReviewsOverview["distribution"] = [0, 0, 0, 0, 0];
    for (const r of rows) distribution[r.stars - 1]++;
    const average = rows.length ? Math.round((rows.reduce((n, r) => n + r.stars, 0) / rows.length) * 10) / 10 : null;
    return {
      enabled: est.enabled,
      googleReviewUrl: est.googleReviewUrl,
      count: rows.length,
      average,
      distribution,
      recent: rows.slice(0, 50).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    };
  });
}

export async function saveReviewSettings(db: Db, s: Scope, raw: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { enabled, googleReviewUrl } = parsed.data;
  await withTenant(db, tenantOf(s), async (tx) => {
    await tx.update(establishments).set({ reviewsEnabled: enabled, googleReviewUrl, updatedAt: new Date() }).where(eq(establishments.id, s.establishmentId));
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: "establishment.reviews_settings",
      entityType: "establishment",
      entityId: s.establishmentId,
      after: { enabled, googleReviewUrl },
    });
  });
  return { ok: true };
}
