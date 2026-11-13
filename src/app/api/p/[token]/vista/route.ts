import { getDb } from "@/server/db/client";
import { getPlatformState } from "@/server/platform/admin-auth";
import { recordPreviewView } from "@/server/platform/menu-previews";
import { clientIpFromHeaders, hashClientIp, hitRateLimit } from "@/server/security/rate-limit";
import { json } from "@/server/staff/http";
import { isSameOrigin } from "@/server/staff/session";

export const dynamic = "force-dynamic";

/** O navegador avisa que a pré-visualização foi aberta. As visitas da equipa MESVIO não contam. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isSameOrigin(request)) return json({ message: "Pedido recusado." }, 403);
  const db = await getDb();
  if ((await getPlatformState(db).catch(() => ({ kind: "anonymous" as const }))).kind === "ok") return json({ ok: true });
  const ip = hashClientIp(clientIpFromHeaders(request.headers));
  if (!(await hitRateLimit(db, `preview-view:${ip}:${token.slice(0, 40)}`, { limit: 10, windowSeconds: 60 * 60 })).allowed) return json({ ok: true });
  return json({ ok: await recordPreviewView(db, token) });
}
