import "server-only";
import { cache } from "react";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { diningTables, establishments } from "@/server/db/schema";
import { getTableMenu, type TableMenuView } from "@/server/menu/get-table-menu";
import { getTableBranding, type TableBranding } from "@/server/branding/table-branding";
import { resolveExtraLink } from "./extras-service";

/**
 * Ementa pública para os extras "Ementa na TV" e "Site do restaurante": o mesmo conteúdo da ementa
 * das mesas (preços, fotos, menu do dia), lido pelo link secreto do extra (só com o extra ligado).
 */
export interface PublicMenu {
  menu: TableMenuView;
  branding: TableBranding | null;
  openingHours: Record<string, [string, string][]> | null;
}

async function load(kind: "tv" | "site", token: string): Promise<PublicMenu | null> {
  const db = await getDb();
  const ids = await resolveExtraLink(db, kind, token);
  if (!ids) return null;
  const row = await withTenant(db, { organizationId: ids.organizationId }, async (tx) => {
    const [t] = await tx
      .select({ token: diningTables.publicToken })
      .from(diningTables)
      .where(and(eq(diningTables.establishmentId, ids.establishmentId), eq(diningTables.active, true)))
      .orderBy(asc(diningTables.createdAt))
      .limit(1);
    const [e] = await tx.select({ hours: establishments.openingHours }).from(establishments).where(eq(establishments.id, ids.establishmentId));
    return { tableToken: t?.token ?? null, hours: e?.hours ?? null };
  });
  if (!row.tableToken) return null;
  const [menu, branding] = await Promise.all([getTableMenu(row.tableToken, { db }), getTableBranding(row.tableToken, db)]);
  return menu ? { menu, branding, openingHours: row.hours } : null;
}

export const loadPublicMenu = cache(load);
