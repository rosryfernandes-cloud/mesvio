import "server-only";
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { establishments, memberships, staffProfiles } from "@/server/db/schema";
import { authMode } from "./config";

/** Só no modo dev: utilizadores com acesso a algum restaurante, para a página de entrada. */
export async function listDevUsers(root: Db) {
  if (authMode() !== "dev") return [];
  const rows = await root
    .select({
      userId: staffProfiles.userId,
      email: staffProfiles.email,
      displayName: staffProfiles.displayName,
      role: memberships.role,
      organizationId: memberships.organizationId,
      establishmentName: establishments.name,
    })
    .from(staffProfiles)
    .innerJoin(memberships, eq(memberships.userId, staffProfiles.userId))
    .leftJoin(establishments, eq(establishments.id, memberships.establishmentId))
    .orderBy(asc(staffProfiles.email));
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.userId) && seen.add(r.userId));
}
