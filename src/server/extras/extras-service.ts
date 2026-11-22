import "server-only";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { queryRows, withTenant } from "@/server/db/tenant";
import { establishments, type ExtrasRow } from "@/server/db/schema";
import { EXTRA_KEYS, type ExtraKey } from "@/lib/extras";

/** Extras de um restaurante (ligados pela equipa MESVIO na Central). */

export async function getExtras(db: Db, organizationId: string, establishmentId: string): Promise<ExtrasRow> {
  return withTenant(db, { organizationId }, async (tx) => {
    const [e] = await tx.select({ extras: establishments.extras }).from(establishments).where(eq(establishments.id, establishmentId));
    return e?.extras ?? { enabled: [] };
  });
}

const newToken = () => randomBytes(18).toString("base64url");

/** Liga ou desliga um extra. Ao ligar a TV ou o site, cria o link secreto (se ainda não houver). */
export async function setExtra(db: Db, organizationId: string, establishmentId: string, key: ExtraKey, on: boolean): Promise<ExtrasRow> {
  return withTenant(db, { organizationId }, async (tx) => {
    const [e] = await tx.select({ extras: establishments.extras }).from(establishments).where(eq(establishments.id, establishmentId));
    const cur: ExtrasRow = e?.extras ?? { enabled: [] };
    const enabled = new Set(cur.enabled.filter((k): k is ExtraKey => (EXTRA_KEYS as string[]).includes(k)));
    if (on) enabled.add(key);
    else enabled.delete(key);
    const next: ExtrasRow = { ...cur, enabled: [...enabled] };
    if (on && key === "tv" && !next.tvToken) next.tvToken = newToken();
    if (on && key === "site" && !next.siteToken) next.siteToken = newToken();
    await tx.update(establishments).set({ extras: next, updatedAt: new Date() }).where(eq(establishments.id, establishmentId));
    return next;
  });
}

/** Troca o link da TV ou do site (o antigo deixa de funcionar). */
export async function regenerateLink(db: Db, organizationId: string, establishmentId: string, kind: "tv" | "site"): Promise<ExtrasRow> {
  return withTenant(db, { organizationId }, async (tx) => {
    const [e] = await tx.select({ extras: establishments.extras }).from(establishments).where(eq(establishments.id, establishmentId));
    const next: ExtrasRow = { ...(e?.extras ?? { enabled: [] }), [kind === "tv" ? "tvToken" : "siteToken"]: newToken() };
    await tx.update(establishments).set({ extras: next, updatedAt: new Date() }).where(eq(establishments.id, establishmentId));
    return next;
  });
}

/** Link público da TV ou do site → restaurante (só com o extra ligado). */
export async function resolveExtraLink(db: Db, kind: "tv" | "site", token: string): Promise<{ organizationId: string; establishmentId: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const [row] = await queryRows<{ organization_id: string; establishment_id: string }>(db, sql`select organization_id, establishment_id from app.resolve_extra_link(${kind}, ${token})`);
  return row ? { organizationId: row.organization_id, establishmentId: row.establishment_id } : null;
}
