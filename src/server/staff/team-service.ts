import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { auditLogs, memberships, staffProfiles } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { UserDirectory } from "@/server/auth/user-directory";
import { manageableRoles, type StaffContext, type StaffRole } from "./context";

export interface TeamMember {
  membershipId: string;
  userId: string;
  email: string;
  displayName?: string;
  role: StaffRole;
  /** Associação a toda a organização (todos os restaurantes) em vez de só a este. */
  wholeOrganization: boolean;
  isYou: boolean;
  /** O utilizador atual pode mudar o perfil ou remover este membro. */
  manageable: boolean;
}

type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId" | "role">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

/** Membros com acesso a este restaurante (próprios e da organização inteira). */
export async function listTeam(db: Db, s: Scope): Promise<TeamMember[]> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const rows = await tx
      .select({
        membershipId: memberships.id,
        userId: memberships.userId,
        role: memberships.role,
        establishmentId: memberships.establishmentId,
        email: staffProfiles.email,
        displayName: staffProfiles.displayName,
      })
      .from(memberships)
      .innerJoin(staffProfiles, eq(staffProfiles.userId, memberships.userId))
      .where(or(eq(memberships.establishmentId, s.establishmentId), isNull(memberships.establishmentId)))
      .orderBy(memberships.role, staffProfiles.email);
    const allowed = manageableRoles(s.role);
    return rows.map((r) => ({
      membershipId: r.membershipId,
      userId: r.userId,
      email: r.email,
      displayName: r.displayName ?? undefined,
      role: r.role,
      wholeOrganization: r.establishmentId === null,
      isYou: r.userId === s.userId,
      manageable: r.userId !== s.userId && allowed.includes(r.role),
    }));
  });
}

export const inviteSchema = z.object({
  email: z.email().max(200).transform((e) => e.trim().toLowerCase()),
  displayName: z.string().trim().max(80).optional(),
  role: z.enum(["owner", "manager", "staff"]),
});

export type TeamResult = { ok: true } | { ok: false; code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "LAST_OWNER"; message: string };

const forbidden: TeamResult = { ok: false, code: "FORBIDDEN", message: "O seu perfil não permite esta alteração." };

export async function inviteMember(db: Db, s: Scope, input: z.infer<typeof inviteSchema>, users: UserDirectory): Promise<TeamResult> {
  if (!manageableRoles(s.role).includes(input.role)) return forbidden;
  const { userId } = await users.ensureUser(input.email);
  return withTenant(db, tenantOf(s), async (tx) => {
    // Donos ficam com acesso à organização toda; os restantes só a este restaurante.
    const establishmentId = input.role === "owner" ? null : s.establishmentId;
    const existing = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userId),
          establishmentId ? or(eq(memberships.establishmentId, establishmentId), isNull(memberships.establishmentId)) : undefined,
        ),
      )
      .limit(1);
    if (existing.length > 0) return { ok: false, code: "CONFLICT", message: "Esta pessoa já faz parte da equipa." };

    await tx.insert(memberships).values({ organizationId: s.organizationId, userId, role: input.role, establishmentId });
    // Perfil global (o utilizador pode trabalhar em vários restaurantes): só se cria se ainda não existir.
    await tx.insert(staffProfiles).values({ userId, email: input.email, displayName: input.displayName || null }).onConflictDoNothing();
    await audit(tx, s, "team.invite", userId, { role: input.role });
    return { ok: true };
  });
}

async function loadTarget(tx: Db, s: Scope, membershipId: string) {
  const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId)).for("update");
  if (!m || (m.establishmentId !== null && m.establishmentId !== s.establishmentId)) return null;
  return m;
}

async function ownersLeft(tx: Db): Promise<number> {
  return tx.$count(memberships, eq(memberships.role, "owner"));
}

export async function changeRole(db: Db, s: Scope, membershipId: string, role: StaffRole): Promise<TeamResult> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const m = await loadTarget(tx, s, membershipId);
    if (!m) return { ok: false, code: "NOT_FOUND", message: "Membro não encontrado." };
    const allowed = manageableRoles(s.role);
    if (m.userId === s.userId || !allowed.includes(m.role) || !allowed.includes(role)) return forbidden;
    if (m.role === "owner" && role !== "owner" && (await ownersLeft(tx)) <= 1) {
      return { ok: false, code: "LAST_OWNER", message: "Tem de haver sempre pelo menos um dono." };
    }
    await tx
      .update(memberships)
      .set({ role, establishmentId: role === "owner" ? null : (m.establishmentId ?? s.establishmentId) })
      .where(eq(memberships.id, membershipId));
    await audit(tx, s, "team.change_role", m.userId, { from: m.role, to: role });
    return { ok: true };
  });
}

export async function removeMember(db: Db, s: Scope, membershipId: string): Promise<TeamResult> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const m = await loadTarget(tx, s, membershipId);
    if (!m) return { ok: false, code: "NOT_FOUND", message: "Membro não encontrado." };
    if (m.userId === s.userId || !manageableRoles(s.role).includes(m.role)) return forbidden;
    if (m.role === "owner" && (await ownersLeft(tx)) <= 1) {
      return { ok: false, code: "LAST_OWNER", message: "Tem de haver sempre pelo menos um dono." };
    }
    await tx.delete(memberships).where(eq(memberships.id, membershipId));
    await audit(tx, s, "team.remove", m.userId, { role: m.role });
    return { ok: true };
  });
}

async function audit(tx: Db, s: Scope, action: string, targetUserId: string, after: unknown) {
  await tx.insert(auditLogs).values({
    organizationId: s.organizationId,
    actorType: "user",
    actorId: s.userId,
    action,
    entityType: "membership",
    entityId: targetUserId,
    after,
  });
}
