import "server-only";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import type { Db } from "@/server/db/client";
import { staffProfiles } from "@/server/db/schema";
import { queryRows, withTenant } from "@/server/db/tenant";

export type StaffRole = "owner" | "manager" | "staff";

/** Quem está no painel e em que restaurante. Tudo o que o painel faz parte daqui. */
export interface StaffContext {
  userId: string;
  organizationId: string;
  establishmentId: string;
  establishmentName: string;
  role: StaffRole;
  displayName: string;
  /** Restaurantes a que este utilizador tem acesso (para trocar no painel). */
  establishments: { id: string; name: string; role: StaffRole }[];
}

/**
 * Permissões por perfil.
 * - staff: tratar pedidos e esgotados.
 * - manager: + definições do restaurante e gerir a equipa de staff.
 * - owner: tudo, incluindo gerentes e outros donos.
 */
const PERMISSIONS = {
  "orders.act": ["owner", "manager", "staff"],
  "catalog.sold_out": ["owner", "manager", "staff"],
  "settings.edit": ["owner", "manager"],
  "team.view": ["owner", "manager"],
} as const satisfies Record<string, readonly StaffRole[]>;
export type Permission = keyof typeof PERMISSIONS;

export function can(ctx: Pick<StaffContext, "role">, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly StaffRole[]).includes(ctx.role);
}

/** Que perfis pode este utilizador atribuir/gerir na equipa. */
export function manageableRoles(role: StaffRole): StaffRole[] {
  if (role === "owner") return ["owner", "manager", "staff"];
  if (role === "manager") return ["staff"];
  return [];
}

export const ESTABLISHMENT_COOKIE = "painel_estabelecimento";

interface MembershipRow {
  organization_id: string;
  establishment_id: string;
  establishment_name: string;
  role: StaffRole;
}

const RANK: Record<StaffRole, number> = { owner: 3, manager: 2, staff: 1 };

/** Contexto de um utilizador, no restaurante preferido (se tiver acesso) ou no primeiro. */
export async function resolveStaffContext(db: Db, userId: string, preferredEstablishmentId?: string): Promise<StaffContext | null> {
  const rows = await queryRows<MembershipRow>(
    db,
    sql`select organization_id, establishment_id, establishment_name, role from app.user_memberships(${userId}::uuid)`,
  );
  if (rows.length === 0) return null;

  // Várias associações ao mesmo restaurante (ex.: dono da organização e staff da casa): vale a mais alta.
  const byEst = new Map<string, MembershipRow>();
  for (const r of rows) {
    const prev = byEst.get(r.establishment_id);
    if (!prev || RANK[r.role] > RANK[prev.role]) byEst.set(r.establishment_id, r);
  }
  const all = [...byEst.values()];
  const current = all.find((r) => r.establishment_id === preferredEstablishmentId) ?? all[0];

  const [profile] = await withTenant(db, { organizationId: current.organization_id, userId }, (tx) =>
    tx.select({ name: staffProfiles.displayName, email: staffProfiles.email }).from(staffProfiles).where(eq(staffProfiles.userId, userId)),
  );

  return {
    userId,
    organizationId: current.organization_id,
    establishmentId: current.establishment_id,
    establishmentName: current.establishment_name,
    role: current.role,
    displayName: profile?.name || profile?.email || "Utilizador",
    establishments: all.map((r) => ({ id: r.establishment_id, name: r.establishment_name, role: r.role })),
  };
}

export async function preferredEstablishmentFromCookies(): Promise<string | undefined> {
  return (await cookies()).get(ESTABLISHMENT_COOKIE)?.value;
}
