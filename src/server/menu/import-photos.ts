import "server-only";
import type { Db } from "@/server/db/client";
import { MAX_IMAGE_BYTES, saveProductImage, sniffImageType } from "./menu-images";
import { safeFetch, type Resolver } from "@/server/security/safe-fetch";
import type { StaffContext } from "@/server/staff/context";

type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;

/** No máximo isto de cada vez (o resto o dono põe no separador Fotos). */
const MAX_PHOTOS = 150;
const PARALLEL = 4;

/**
 * Traz para a MESVIO as fotos dos pratos que estavam no site do restaurante (escolhidas pelo dono
 * na revisão). Uma foto que não abra, não seja JPEG/PNG/WebP ou passe de 1 MB fica de fora.
 */
export async function importProductPhotos(db: Db, s: Scope, photos: { ref: string; imageUrl: string }[], resolve?: Resolver): Promise<number> {
  const queue = photos.slice(0, MAX_PHOTOS);
  let saved = 0;
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const r = await safeFetch(item.imageUrl, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 8_000, accept: "image/jpeg,image/png,image/webp", resolve });
      if (!r.ok || !sniffImageType(r.bytes)) continue;
      if ((await saveProductImage(db, s, item.ref, r.bytes)).ok) saved++;
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return saved;
}
