import { z } from "zod";
import { getDb } from "@/server/db/client";
import { readMenuFromLink } from "@/server/menu/menu-link";
import { guardPlatform } from "@/server/platform/admin-auth";
import { hitRateLimit } from "@/server/security/rate-limit";
import { json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CENTRAL_DEMO_RATE_LIMIT = { limit: 30, windowSeconds: 60 * 60 };
const STATUS = { NOT_CONFIGURED: 503, UNAVAILABLE: 503, UNREADABLE: 422, TOO_LONG: 413 } as const;

/**
 * Demonstração rápida a partir do link da ementa (só administradores): página do site, PDF ou
 * imagem. O servidor descarrega o link (o navegador não o pode fazer por causa do CORS) e devolve a
 * proposta, como a leitura por fotos. Não grava nada.
 */
export async function POST(request: Request) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const parsed = z.object({ url: z.string().trim().min(4).max(2000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Cole o link da ementa (página do site ou PDF)." }, 400);
  // O mesmo limite das fotos: cada leitura, por foto ou por link, conta para as demonstrações da hora.
  const limit = await hitRateLimit(await getDb(), `central-demo:${admin.userId}`, CENTRAL_DEMO_RATE_LIMIT);
  if (!limit.allowed) return json({ message: "Já fez muitas demonstrações na última hora." }, 429);
  const result = await readMenuFromLink(parsed.data.url);
  if (!result.ok) return json({ code: result.code, message: result.message }, STATUS[result.code]);
  return json({ draft: result.draft });
}
