import { z } from "zod";
import { getDb } from "@/server/db/client";
import { DESCRIPTOR_SCHEMA, identifyFace, KIND_SCHEMA, kioskView, MAX_CLOCK_PHOTO_BYTES, PIN_SCHEMA, punch, punchWithTicket } from "@/server/clock/clock-service";
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

/**
 * Picar ponto (multipart). Três formas:
 * - `descriptor` (assinatura da cara, JSON): só identifica e devolve um bilhete para confirmar;
 * - `ticket` (+ photo): confirma o registo de quem a cara identificou;
 * - `employeeId` + `pin` (+ photo): com o nome e o PIN.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_CLOCK_PHOTO_BYTES + 16 * 1024) return json({ message: "A foto é demasiado grande." }, 413);
  const form = await request.formData().catch(() => null);

  const descriptorField = form?.get("descriptor");
  if (typeof descriptorField === "string") {
    let raw: unknown = null;
    try {
      raw = JSON.parse(descriptorField);
    } catch {}
    const descriptor = DESCRIPTOR_SCHEMA.safeParse(raw);
    if (!descriptor.success) return json({ message: "Cara inválida." }, 400);
    const db = await getDb();
    const limit = await hitRateLimit(db, `ponto-cara:${token.slice(0, 40)}`, { limit: 120, windowSeconds: 10 * 60 });
    if (!limit.allowed) return json({ message: "Demasiadas tentativas. Use o nome e o PIN." }, 429);
    const r = await identifyFace(db, token, descriptor.data);
    return r.ok ? json(r) : json({ code: r.code, message: r.message }, r.code === "NOT_FOUND" ? 404 : 422);
  }

  const ticketField = form?.get("ticket");
  const parsed = typeof ticketField === "string" ? null : fields.safeParse({ employeeId: form?.get("employeeId"), pin: form?.get("pin") });
  if (parsed && !parsed.success) return json({ message: "Escolha o nome e meta o PIN de 4 algarismos." }, 400);

  const file = form?.get("photo");
  let photo: Buffer | null = null;
  if (file instanceof Blob && file.size > 0) {
    photo = Buffer.from(await file.arrayBuffer());
    if (photo.length > MAX_CLOCK_PHOTO_BYTES || detectPhotoType(photo) !== "image/jpeg") return json({ message: "Foto inválida." }, 400);
  }

  const db = await getDb();
  const perKiosk = await hitRateLimit(db, `ponto-tablet:${token.slice(0, 40)}`, { limit: 200, windowSeconds: 60 * 60 });
  if (!perKiosk.allowed) return json({ message: "Demasiadas tentativas. Espere uns minutos ou fale com o responsável." }, 429);
  // Entrada, pausa, regresso ou saída escolhida no tablet (sem ela, o mais provável).
  const action = KIND_SCHEMA.safeParse(form?.get("action")).data;
  let result;
  if (typeof ticketField === "string") result = await punchWithTicket(db, token, ticketField, photo, action);
  else {
    // Um PIN de 4 algarismos adivinha-se com tentativas: poucas por funcionário.
    const perEmployee = await hitRateLimit(db, `ponto:${parsed!.data!.employeeId}`, { limit: 6, windowSeconds: 15 * 60 });
    if (!perEmployee.allowed) return json({ message: "Demasiadas tentativas. Espere uns minutos ou fale com o responsável." }, 429);
    result = await punch(db, token, parsed!.data!.employeeId, parsed!.data!.pin, photo, action);
  }
  if (!result.ok) return json({ code: result.code, message: result.message }, result.code === "WRONG_PIN" ? 403 : result.code === "NOT_ALLOWED" ? 409 : 404);
  return json(result);
}
