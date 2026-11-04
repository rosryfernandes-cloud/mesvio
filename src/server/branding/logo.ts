import "server-only";
import type { Db } from "@/server/db/client";
import { deleteProductImage, saveProductImage, type SaveImageResult } from "@/server/menu/menu-images";
import { getBranding, setBranding, type StaffScope } from "@/server/staff/staff-service";

/** O logótipo guarda-se com as fotos da ementa; esta referência nunca corresponde a um artigo. */
export const LOGO_IMAGE_REF = "__logo__";

/** Guarda o logótipo enviado pelo dono e passa a usá-lo na ementa. `baseUrl` é o endereço público (https) do site. */
export async function saveEstablishmentLogo(db: Db, s: StaffScope, bytes: Buffer, baseUrl: string): Promise<SaveImageResult> {
  const saved = await saveProductImage(db, s, LOGO_IMAGE_REF, bytes);
  if (!saved.ok) return saved;
  const url = `${baseUrl.replace(/\/$/, "")}${saved.url}`;
  const { brandColor } = await getBranding(db, s);
  await setBranding(db, s, { brandColor, brandLogoUrl: url });
  return { ok: true, url };
}

/** Tira o logótipo da ementa, seja enviado ou um endereço colado. */
export async function removeEstablishmentLogo(db: Db, s: StaffScope): Promise<void> {
  await deleteProductImage(db, s, LOGO_IMAGE_REF);
  const { brandColor } = await getBranding(db, s);
  await setBranding(db, s, { brandColor, brandLogoUrl: null });
}
