import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { auditLogs, menuImages } from "@/server/db/schema";
import type { StaffContext } from "@/server/staff/context";

type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_IMAGES_PER_ESTABLISHMENT = 600;

/**
 * Tipo real da imagem pelos primeiros bytes (não pelo nome nem pelo que o browser diz). Só
 * fotografias: JPEG, PNG ou WebP. SVG fica de fora (pode levar código).
 */
export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

export const imageUrl = (id: string, sha256: string) => `/api/imagens/${id}?v=${sha256.slice(0, 12)}`;

export type SaveImageResult = { ok: true; url: string } | { ok: false; code: "INVALID" | "TOO_LARGE" | "LIMIT"; message: string };

/** Guarda (ou substitui) a foto de um artigo. Quem chama já confirmou que o artigo existe na ementa. */
export async function saveProductImage(db: Db, s: Scope, posProductRef: string, bytes: Buffer): Promise<SaveImageResult> {
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, code: "TOO_LARGE", message: "A foto tem mais de 1 MB. Tente outra (é reduzida automaticamente no telemóvel)." };
  const contentType = sniffImageType(bytes);
  if (!contentType) return { ok: false, code: "INVALID", message: "Formato não suportado. Use uma fotografia JPEG, PNG ou WebP." };
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  return withTenant(db, tenantOf(s), async (tx): Promise<SaveImageResult> => {
    const count = await tx.$count(menuImages, eq(menuImages.establishmentId, s.establishmentId));
    const [existing] = await tx
      .select({ id: menuImages.id })
      .from(menuImages)
      .where(and(eq(menuImages.establishmentId, s.establishmentId), eq(menuImages.posProductRef, posProductRef)));
    if (!existing && count >= MAX_IMAGES_PER_ESTABLISHMENT) return { ok: false, code: "LIMIT", message: "Limite de fotografias deste restaurante atingido." };
    // Substituir = apagar e criar outra linha (id novo → URL novo → a cache nunca mostra a antiga).
    if (existing) await tx.delete(menuImages).where(eq(menuImages.id, existing.id));
    const [row] = await tx
      .insert(menuImages)
      .values({ organizationId: s.organizationId, establishmentId: s.establishmentId, posProductRef, contentType, bytes, sizeBytes: bytes.length, sha256 })
      .returning({ id: menuImages.id });
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: existing ? "menu.image_replaced" : "menu.image_added",
      entityType: "product",
      entityId: posProductRef,
      after: { sizeBytes: bytes.length, contentType },
    });
    return { ok: true, url: imageUrl(row.id, sha256) };
  });
}

export async function deleteProductImage(db: Db, s: Scope, posProductRef: string): Promise<boolean> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const deleted = await tx
      .delete(menuImages)
      .where(and(eq(menuImages.establishmentId, s.establishmentId), eq(menuImages.posProductRef, posProductRef)))
      .returning({ id: menuImages.id });
    if (deleted.length) {
      await tx.insert(auditLogs).values({
        organizationId: s.organizationId,
        actorType: "user",
        actorId: s.userId,
        action: "menu.image_removed",
        entityType: "product",
        entityId: posProductRef,
      });
    }
    return deleted.length > 0;
  });
}

/** Artigo → URL da foto, para a ementa e para o painel (sem ler os bytes). */
export async function productImageUrls(db: Db, organizationId: string, establishmentId: string): Promise<Map<string, string>> {
  const rows = await withTenant(db, { organizationId }, (tx) =>
    tx
      .select({ id: menuImages.id, ref: menuImages.posProductRef, sha: menuImages.sha256 })
      .from(menuImages)
      .where(eq(menuImages.establishmentId, establishmentId)),
  );
  return new Map(rows.map((r) => [r.ref, imageUrl(r.id, r.sha)]));
}

/**
 * Bytes de uma foto para a servir ao público (as fotos da ementa são públicas por natureza:
 * qualquer pessoa com o QR as vê). Leitura de sistema, só pelo id (UUID aleatório).
 */
export async function readImage(systemDb: Db, id: string): Promise<{ bytes: Buffer; contentType: string; sha256: string } | null> {
  const [row] = await systemDb
    .select({ bytes: menuImages.bytes, contentType: menuImages.contentType, sha256: menuImages.sha256 })
    .from(menuImages)
    .where(eq(menuImages.id, id))
    .limit(1);
  return row ?? null;
}
