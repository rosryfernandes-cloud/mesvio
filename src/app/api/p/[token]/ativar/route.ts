import { getDb } from "@/server/db/client";
import { requestActivation } from "@/server/platform/menu-previews";
import { clientIpFromHeaders, hashClientIp, hitRateLimit } from "@/server/security/rate-limit";
import { json } from "@/server/staff/http";
import { isSameOrigin } from "@/server/staff/session";

export const dynamic = "force-dynamic";

/** "Quero ativar" na pré-visualização: avisa a equipa MESVIO. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isSameOrigin(request)) return json({ message: "Pedido recusado." }, 403);
  const db = await getDb();
  const ip = hashClientIp(clientIpFromHeaders(request.headers));
  if (!(await hitRateLimit(db, `preview-activate:${ip}`, { limit: 5, windowSeconds: 60 * 60 })).allowed) {
    return json({ message: "Já recebemos o seu pedido. Vamos entrar em contacto." }, 429);
  }
  const ok = await requestActivation(db, token, await request.json().catch(() => ({})));
  return ok ? json({ ok: true }) : json({ message: "Este link expirou. Fale connosco para preparar outro." }, 404);
}
