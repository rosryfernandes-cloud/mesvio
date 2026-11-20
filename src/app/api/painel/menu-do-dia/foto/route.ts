import { getDb } from "@/server/db/client";
import { readDailyMenuPhoto } from "@/server/menu/daily-menu";
import { detectPhotoType, MAX_MENU_UPLOAD_BYTES } from "@/server/menu/menu-import";
import { hitRateLimit } from "@/server/security/rate-limit";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATUS = { NOT_CONFIGURED: 503, UNAVAILABLE: 503, UNREADABLE: 422 } as const;

/** Lê a fotografia da folha do menu do dia (multipart, campo `photo`) e devolve uma proposta. Não grava nada. */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!length || length > MAX_MENU_UPLOAD_BYTES + 64 * 1024) return json({ message: "A foto é demasiado grande." }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof Blob)) return json({ message: "Escolha uma foto." }, 400);
  const data = Buffer.from(await file.arrayBuffer());
  const mediaType = detectPhotoType(data);
  if (!mediaType) return json({ message: "Só aceitamos fotos (JPEG, PNG ou WebP) ou PDF." }, 400);

  const db = await getDb();
  const limit = await hitRateLimit(db, `menu-do-dia:${ctx.establishmentId}`, { limit: 15, windowSeconds: 60 * 60 });
  if (!limit.allowed) return json({ message: "Já foram lidas muitas fotos na última hora. Tente mais tarde." }, 429);

  const result = await readDailyMenuPhoto({ mediaType, data });
  if (!result.ok) return json({ code: result.code, message: result.message }, STATUS[result.code]);
  return json({ reading: result.reading });
}
