import { getDb } from "@/server/db/client";
import { detectPhotoType, MAX_MENU_PHOTOS, MAX_MENU_UPLOAD_BYTES, type MenuPhoto, readMenuPhotos } from "@/server/menu/menu-import";
import { guardPlatform } from "@/server/platform/admin-auth";
import { hitRateLimit } from "@/server/security/rate-limit";
import { json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CENTRAL_DEMO_RATE_LIMIT = { limit: 30, windowSeconds: 60 * 60 };
const STATUS = { NOT_CONFIGURED: 503, UNAVAILABLE: 503, UNREADABLE: 422, TOO_LONG: 413 } as const;

/**
 * Demonstração rápida (só administradores): lê as fotos da ementa de um restaurante que ainda não é
 * cliente e devolve a proposta. Não grava nada nem cria restaurante.
 */
export async function POST(request: Request) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!length || length > MAX_MENU_UPLOAD_BYTES + 64 * 1024) return json({ message: "As fotos são demasiado grandes. Envie menos de cada vez." }, 413);
  const form = await request.formData().catch(() => null);
  const files = form?.getAll("photos").filter((f): f is File => f instanceof Blob) ?? [];
  if (files.length === 0 || files.length > MAX_MENU_PHOTOS) return json({ message: `Escolha entre 1 e ${MAX_MENU_PHOTOS} fotos.` }, 400);
  const photos: MenuPhoto[] = [];
  for (const file of files) {
    const data = Buffer.from(await file.arrayBuffer());
    const mediaType = detectPhotoType(data);
    if (!mediaType) return json({ message: "Só aceitamos fotos (JPEG, PNG ou WebP) ou PDF." }, 400);
    photos.push({ mediaType, data });
  }
  const limit = await hitRateLimit(await getDb(), `central-demo:${admin.userId}`, CENTRAL_DEMO_RATE_LIMIT);
  if (!limit.allowed) return json({ message: "Já fez muitas demonstrações na última hora." }, 429);
  const result = await readMenuPhotos(photos);
  if (!result.ok) return json({ message: result.message }, STATUS[result.code]);
  return json({ draft: result.draft });
}
