import { z } from "zod";
import { getDb } from "@/server/db/client";
import { kioskView, MAX_CLOCK_PHOTO_BYTES, PIN_SCHEMA, punch } from "@/server/clock/clock-service";
import { detectPhotoType } from "@/server/menu/menu-import";
import { hitRateLimit } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Tablet de picar ponto: nome do restaurante e funcionários (com o próximo registo de cada um). */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await kioskView(await getDb(), token);
  if (!view) return json({ message: "Este link de picar ponto já não é válido." }, 404);
  return json(view);
}

const fields = z.object({ employeeId: z.uuid(), pin: PIN_SCHEMA });

/** Picar ponto (multipart: employeeId, pin e, se houver câmara, photo). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_CLOCK_PHOTO_BYTES + 16 * 1024) return json({ message: "A foto é demasiado grande." }, 413);
  const form = await request.formData().catch(() => null);
  const parsed = fields.safeParse({ employeeId: form?.get("employeeId"), pin: form?.get("pin") });
  if (!parsed.success) return json({ message: "Escolha o nome e meta o PIN de 4 algarismos." }, 400);

  const file = form?.get("photo");
  let photo: Buffer | null = null;
  if (file instanceof Blob && file.size > 0) {
    photo = Buffer.from(await file.arrayBuffer());
    if (photo.length > MAX_CLOCK_PHOTO_BYTES || detectPhotoType(photo) !== "image/jpeg") return json({ message: "Foto inválida." }, 400);
  }

  const db = await getDb();
  // Um PIN de 4 algarismos adivinha-se com tentativas: poucas por funcionário, e um teto por tablet.
  const perEmployee = await hitRateLimit(db, `ponto:${parsed.data.employeeId}`, { limit: 6, windowSeconds: 15 * 60 });
  const perKiosk = await hitRateLimit(db, `ponto-tablet:${token.slice(0, 40)}`, { limit: 200, windowSeconds: 60 * 60 });
  if (!perEmployee.allowed || !perKiosk.allowed) return json({ message: "Demasiadas tentativas. Espere uns minutos ou fale com o responsável." }, 429);

  const result = await punch(db, token, parsed.data.employeeId, parsed.data.pin, photo);
  if (!result.ok) return json({ code: result.code, message: result.message }, result.code === "WRONG_PIN" ? 403 : 404);
  return json(result);
}
