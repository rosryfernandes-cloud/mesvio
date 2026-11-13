import { getDb } from "@/server/db/client";
import { guardPlatform } from "@/server/platform/admin-auth";
import { createPreviewFromLink } from "@/server/platform/menu-previews";
import { hitRateLimit } from "@/server/security/rate-limit";
import { json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
/** Ler a ementa e traduzir para 4 línguas pode levar perto de dois minutos numa ementa grande. */
export const maxDuration = 300;

/** Cria a pré-visualização de um restaurante a partir do link da ementa (um de cada vez; a Central chama em lote). */
export async function POST(request: Request) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const db = await getDb();
  if (!(await hitRateLimit(db, `central-preview-link:${admin.userId}`, { limit: 80, windowSeconds: 60 * 60 })).allowed) {
    return json({ message: "Já criou muitos links na última hora. Tente mais tarde." }, 429);
  }
  const r = await createPreviewFromLink(db, admin, await request.json().catch(() => null));
  if (!r.ok) return json({ message: r.message }, 422);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
  return json({ url: `${base}/p/${r.token}`, products: r.products }, 201);
}
