import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { resolveTableToken, withTenant } from "@/server/db/tenant";
import { establishments } from "@/server/db/schema";
import { isWellFormedTableToken } from "@/server/tables/table-token";
import { brandPalette, type BrandPalette } from "@/lib/brand-color";

/** Identidade do restaurante nas páginas do cliente (ementa, pedido, conta). */
export interface TableBranding {
  name: string;
  logoUrl: string | null;
  /** null = cores MESVIO. */
  palette: BrandPalette | null;
}

export async function getTableBranding(token: string, db?: Db): Promise<TableBranding | null> {
  if (!isWellFormedTableToken(token)) return null;
  const conn = db ?? (await getDb());
  const ids = await resolveTableToken(conn, token);
  if (!ids) return null;
  const [row] = await withTenant(conn, { organizationId: ids.organizationId }, (tx) =>
    tx
      .select({ name: establishments.name, color: establishments.brandColor, logoUrl: establishments.brandLogoUrl })
      .from(establishments)
      .where(eq(establishments.id, ids.establishmentId))
      .limit(1),
  );
  if (!row) return null;
  // A cor já foi validada ao gravar; voltar a validar protege contra valores escritos à mão na BD.
  const palette = row.color ? brandPalette(row.color) : null;
  return { name: row.name, logoUrl: row.logoUrl, palette: palette?.ok ? palette.palette : null };
}

/** Uma leitura por pedido HTTP, partilhada entre o layout e a página. */
export const getTableBrandingForRequest = cache((token: string) => getTableBranding(token));
