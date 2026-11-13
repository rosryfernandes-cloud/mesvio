import { getDb } from "@/server/db/client";
import { detectPhotoType, MAX_MENU_PHOTOS, MAX_MENU_UPLOAD_BYTES, MENU_IMPORT_RATE_LIMIT, type MenuPhoto, readMenuPhotos } from "@/server/menu/menu-import";
import { getOwnMenu } from "@/server/menu/own-menu";
import { hitRateLimit } from "@/server/security/rate-limit";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
/** Uma ementa de várias páginas pode demorar cerca de um minuto a ler. */
export const maxDuration = 120;

const STATUS = { NOT_CONFIGURED: 503, UNAVAILABLE: 503, UNREADABLE: 422, TOO_LONG: 413 } as const;

/** Lê as fotografias da ementa (multipart, campo `photos`) e devolve uma proposta. Não grava nada. */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!length || length > MAX_MENU_UPLOAD_BYTES + 64 * 1024) return json({ message: "As fotos são demasiado grandes. Envie menos de cada vez." }, 413);

  const form = await request.formData().catch(() => null);
  const files = form?.getAll("photos").filter((f): f is File => f instanceof Blob) ?? [];
  if (files.length === 0 || files.length > MAX_MENU_PHOTOS) return json({ message: `Escolha entre 1 e ${MAX_MENU_PHOTOS} fotos.` }, 400);

  const photos: MenuPhoto[] = [];
  for (const file of files) {
    const data = Buffer.from(await file.arrayBuffer());
    const mediaType = detectPhotoType(data);
    if (!mediaType) return json({ message: "Só aceitamos fotos em JPEG, PNG ou WebP." }, 400);
    photos.push({ mediaType, data });
  }

  const db = await getDb();
  if ((await getOwnMenu(db, ctx)) === null) return json({ message: "Este restaurante usa a ementa do POS." }, 409);
  const limit = await hitRateLimit(db, `menu-import:${ctx.establishmentId}`, MENU_IMPORT_RATE_LIMIT);
  if (!limit.allowed) return json({ message: "Já foram lidas muitas ementas na última hora. Tente mais tarde." }, 429);

  const result = await readMenuPhotos(photos);
  if (!result.ok) return json({ code: result.code, message: result.message }, STATUS[result.code]);
  return json({ draft: result.draft });
}
