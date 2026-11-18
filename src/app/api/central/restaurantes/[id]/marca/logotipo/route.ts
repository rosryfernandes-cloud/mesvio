import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { establishments } from "@/server/db/schema";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { saveEstablishmentLogo } from "@/server/branding/logo";
import { MAX_IMAGE_BYTES } from "@/server/menu/menu-images";

export const dynamic = "force-dynamic";

/** Central (placas): enviar o logótipo do restaurante (multipart com `file`). Muda também na ementa. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!length || length > MAX_IMAGE_BYTES + 64 * 1024) return json({ message: "O logótipo tem mais de 1 MB." }, 413);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  if (!baseUrl.startsWith("https://")) return json({ message: "O envio de logótipos só funciona num endereço https." }, 400);
  const db = await getDb();
  const [e] = await db.select({ organizationId: establishments.organizationId }).from(establishments).where(eq(establishments.id, id));
  if (!e) return json({ message: "Restaurante não encontrado." }, 404);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return json({ message: "Pedido inválido." }, 400);
  const r = await saveEstablishmentLogo(db, { userId: admin.userId, organizationId: e.organizationId, establishmentId: id }, Buffer.from(await file.arrayBuffer()), baseUrl);
  return r.ok ? json({ ok: true, brandLogoUrl: r.url }, 201) : json(r, r.code === "TOO_LARGE" ? 413 : 400);
}
