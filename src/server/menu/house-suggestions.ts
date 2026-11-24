import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { auditLogs, establishments, type HouseSuggestionsRow } from "@/server/db/schema";
import type { StaffContext } from "@/server/staff/context";

/**
 * Sugestões da casa: o dono escolhe pratos da ementa para aparecerem em destaque no topo, com um
 * interruptor para mostrar ou esconder. Guardam-se só as referências; nome, preço, foto e esgotado
 * vêm sempre da ementa, por isso nunca ficam desatualizados.
 */
export const MAX_HOUSE_SUGGESTIONS = 8;
export const houseSuggestionsSchema = z.object({
  enabled: z.boolean(),
  refs: z.array(z.string().min(1).max(64)).max(MAX_HOUSE_SUGGESTIONS, `Escolha no máximo ${MAX_HOUSE_SUGGESTIONS} pratos.`),
});

type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;

const EMPTY: HouseSuggestionsRow = { enabled: false, refs: [] };

export async function getHouseSuggestions(db: Db, organizationId: string, establishmentId: string): Promise<HouseSuggestionsRow> {
  const [row] = await withTenant(db, { organizationId }, (tx) =>
    tx.select({ s: establishments.houseSuggestions }).from(establishments).where(eq(establishments.id, establishmentId)),
  );
  return row?.s ?? EMPTY;
}

export async function saveHouseSuggestions(db: Db, s: Scope, raw: unknown): Promise<{ ok: true; value: HouseSuggestionsRow } | { ok: false; message: string }> {
  const parsed = houseSuggestionsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Pedido inválido." };
  const value = { enabled: parsed.data.enabled, refs: [...new Set(parsed.data.refs)] };
  await withTenant(db, { organizationId: s.organizationId, userId: s.userId }, async (tx) => {
    await tx
      .update(establishments)
      .set({ houseSuggestions: value, updatedAt: new Date() })
      .where(and(eq(establishments.id, s.establishmentId), eq(establishments.organizationId, s.organizationId)));
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: "menu.house_suggestions",
      entityType: "establishment",
      entityId: s.establishmentId,
      after: value,
    });
  });
  return { ok: true, value };
}
