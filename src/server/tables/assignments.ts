import "server-only";
import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { auditLogs, diningTables, establishments, memberships, staffProfiles, tableSessions } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { StaffContext } from "@/server/staff/context";

/**
 * Mesas por empregado (em teste, ligado por restaurante). Cada mesa pode ter um responsável:
 * o gerente distribui mesas ou zonas no início do turno, ou o empregado "fica com a mesa" quando
 * a atende. Todos continuam a ver todas as mesas (para se ajudarem), mas cada um vê as suas
 * primeiro, e fechar a mesa de um colega pede confirmação e fica registado.
 */
type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId" | "role">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

const isManager = (s: Pick<Scope, "role">) => s.role === "owner" || s.role === "manager";

export const PAID_WITH = ["cash", "card", "other"] as const;
export type PaidWith = (typeof PAID_WITH)[number];
export const PAID_WITH_LABEL: Record<PaidWith, string> = { cash: "Dinheiro", card: "Multibanco", other: "Outro" };

export async function assignmentsEnabled(tx: Db, establishmentId: string): Promise<boolean> {
  const [e] = await tx.select({ on: establishments.tableAssignmentsEnabled }).from(establishments).where(eq(establishments.id, establishmentId));
  return Boolean(e?.on);
}

export async function setAssignmentsEnabled(db: Db, s: Scope, enabled: boolean): Promise<void> {
  await withTenant(db, tenantOf(s), async (tx) => {
    await tx.update(establishments).set({ tableAssignmentsEnabled: enabled, updatedAt: new Date() }).where(eq(establishments.id, s.establishmentId));
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: "establishment.table_assignments",
      entityType: "establishment",
      entityId: s.establishmentId,
      after: { enabled },
    });
  });
}

/** Quem pode ficar com mesas: a equipa com acesso a este restaurante (nome a mostrar). */
export async function assignableStaff(db: Db, s: Scope): Promise<{ userId: string; name: string }[]> {
  return withTenant(db, tenantOf(s), (tx) => staffOf(tx, s.establishmentId));
}

/** O mesmo, dentro de uma transação já aberta (uma só ligação à base de dados). */
async function staffOf(tx: Db, establishmentId: string): Promise<{ userId: string; name: string }[]> {
  const rows = await tx
    .select({ userId: memberships.userId, name: staffProfiles.displayName, email: staffProfiles.email })
    .from(memberships)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, memberships.userId))
    .where(or(eq(memberships.establishmentId, establishmentId), isNull(memberships.establishmentId)));
  const seen = new Map<string, string>();
  for (const r of rows) seen.set(r.userId, r.name || r.email);
  return [...seen].map(([userId, name]) => ({ userId, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
}

type AssignResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "NOT_ALLOWED" | "DISABLED"; message: string };

/**
 * Muda o responsável de uma mesa. O gerente/dono atribui a qualquer pessoa da equipa (ou a ninguém);
 * um empregado só fica com mesas sem responsável, ou larga as suas.
 */
export async function assignTable(db: Db, s: Scope, tableId: string, userId: string | null): Promise<AssignResult> {
  return withTenant(db, tenantOf(s), async (tx): Promise<AssignResult> => {
    if (!(await assignmentsEnabled(tx, s.establishmentId))) return { ok: false, code: "DISABLED", message: "As mesas por empregado estão desligadas." };
    const [table] = await tx
      .select({ id: diningTables.id, assigned: diningTables.assignedUserId })
      .from(diningTables)
      .where(and(eq(diningTables.id, tableId), eq(diningTables.establishmentId, s.establishmentId)));
    if (!table) return { ok: false, code: "NOT_FOUND", message: "Mesa não encontrada." };
    if (!isManager(s)) {
      const claimFree = userId === s.userId && (table.assigned === null || table.assigned === s.userId);
      const releaseOwn = userId === null && table.assigned === s.userId;
      if (!claimFree && !releaseOwn) return { ok: false, code: "NOT_ALLOWED", message: "Esta mesa já tem responsável. Peça ao gerente para a mudar." };
    } else if (userId !== null && !(await staffOf(tx, s.establishmentId)).some((m) => m.userId === userId)) {
      return { ok: false, code: "NOT_ALLOWED", message: "Essa pessoa não faz parte da equipa deste restaurante." };
    }
    await tx.update(diningTables).set({ assignedUserId: userId }).where(eq(diningTables.id, tableId));
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: "table.assign",
      entityType: "dining_table",
      entityId: tableId,
      before: { assignedUserId: table.assigned },
      after: { assignedUserId: userId },
    });
    return { ok: true };
  });
}

/** Fim de turno: todas as mesas ficam sem responsável (gerente/dono). */
export async function clearAssignments(db: Db, s: Scope): Promise<number> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const rows = await tx
      .update(diningTables)
      .set({ assignedUserId: null })
      .where(eq(diningTables.establishmentId, s.establishmentId))
      .returning({ id: diningTables.id });
    return rows.length;
  });
}

export interface ClosedTable {
  at: string;
  tableLabel: string;
  closedBy: string;
  /** Valor que faltava pagar pela app quando a mesa fechou (cobrado ao balcão); null = fechada antes de ligar esta função. */
  dueCents: number | null;
  paidWith: PaidWith | null;
  /** Fechada por alguém que não era o responsável. */
  notTheirs: boolean;
}

/** Mesas fechadas nas últimas 24 h, para o gerente ver quem fechou o quê e como foi pago. */
export async function recentClosures(db: Db, s: Scope, now = new Date()): Promise<ClosedTable[]> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const logs = await tx
      .select({ at: auditLogs.createdAt, actorId: auditLogs.actorId, after: auditLogs.after, sessionId: auditLogs.entityId })
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, s.organizationId), eq(auditLogs.action, "table.close"), gte(auditLogs.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000))))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
    if (!logs.length) return [];
    const sessionIds = logs.map((l) => l.sessionId).filter((id): id is string => Boolean(id));
    const sessions = sessionIds.length
      ? await tx
          .select({ id: tableSessions.id, label: diningTables.label, establishmentId: diningTables.establishmentId })
          .from(tableSessions)
          .innerJoin(diningTables, eq(diningTables.id, tableSessions.tableId))
          .where(inArray(tableSessions.id, sessionIds))
      : [];
    const names = new Map((await staffOf(tx, s.establishmentId)).map((m) => [m.userId, m.name]));
    const out: ClosedTable[] = [];
    for (const l of logs) {
      const session = sessions.find((x) => x.id === l.sessionId);
      if (!session || session.establishmentId !== s.establishmentId) continue;
      const after = (l.after ?? {}) as { dueCents?: number; paidWith?: PaidWith; assignedUserId?: string | null };
      out.push({
        at: l.at.toISOString(),
        tableLabel: session.label,
        closedBy: (l.actorId && names.get(l.actorId)) || "—",
        dueCents: after.dueCents ?? null,
        paidWith: after.paidWith ?? null,
        notTheirs: Boolean(after.assignedUserId && after.assignedUserId !== l.actorId),
      });
    }
    return out;
  });
}
