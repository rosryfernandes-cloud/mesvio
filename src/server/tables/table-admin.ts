import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { auditLogs, diningTables } from "@/server/db/schema";
import { generateTableToken } from "./table-token";
import type { StaffContext } from "@/server/staff/context";

/**
 * Gestão dos lugares (QR Code / NFC). Rodar o QR gera um token novo: o QR antigo (ex.: fotografado
 * e usado para pedir de fora) deixa logo de funcionar, porque app.resolve_table só conhece o novo.
 * A conta aberta da mesa mantém-se (está ligada à mesa, não ao token).
 */
export type TableAdminAction = "rotate_qr" | "deactivate" | "activate";

type Actor = { organizationId: string; establishmentId?: string; actorType: "user" | "admin"; actorId: string };

/** Aplica a ação numa transação já aberta (de tenant ou de sistema). Devolve false se o lugar não existir. */
export async function applyTableAction(tx: Db, actor: Actor, tableId: string, action: TableAdminAction, now = new Date()): Promise<boolean> {
  const where = and(
    eq(diningTables.id, tableId),
    eq(diningTables.organizationId, actor.organizationId),
    actor.establishmentId ? eq(diningTables.establishmentId, actor.establishmentId) : undefined,
  );
  const patch =
    action === "rotate_qr"
      ? { publicToken: generateTableToken(), tokenRotatedAt: now }
      : { active: action === "activate" };
  const updated = await tx.update(diningTables).set(patch).where(where).returning({ id: diningTables.id, label: diningTables.label });
  if (updated.length === 0) return false;
  await tx.insert(auditLogs).values({
    organizationId: actor.organizationId,
    actorType: actor.actorType,
    actorId: actor.actorId,
    action: `table.${action}`,
    entityType: "dining_table",
    entityId: tableId,
    after: { label: updated[0].label },
  });
  return true;
}

/** Dono/gerente, no painel do restaurante: só lugares do restaurante atual (RLS + filtro). */
export async function staffTableAction(
  db: Db,
  s: Pick<StaffContext, "userId" | "organizationId" | "establishmentId">,
  tableId: string,
  action: TableAdminAction,
): Promise<boolean> {
  return withTenant(db, { organizationId: s.organizationId, userId: s.userId }, (tx) =>
    applyTableAction(tx, { organizationId: s.organizationId, establishmentId: s.establishmentId, actorType: "user", actorId: s.userId }, tableId, action),
  );
}
