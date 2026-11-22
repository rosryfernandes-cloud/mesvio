import { z } from "zod";
import { getDb } from "@/server/db/client";
import { canUseExtra } from "@/server/extras/staff-gate";
import { entryPhoto } from "@/server/clock/clock-service";
import { guardStaff } from "@/server/staff/http";

export const dynamic = "force-dynamic";

/** Selfie de um registo de ponto (só para o dono ou o gerente; nunca em cache partilhada). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  // Picar ponto é um extra: só com ele ligado (a equipa MESVIO vê sempre, para testar).
  if (!(await canUseExtra(await getDb(), ctx, "ponto"))) return new Response("Não encontrado", { status: 404 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Não encontrada", { status: 404 });
  const photo = await entryPhoto(await getDb(), ctx, id);
  if (!photo) return new Response("Não encontrada", { status: 404 });
  return new Response(new Uint8Array(photo), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
  });
}
