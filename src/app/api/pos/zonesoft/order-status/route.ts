import { getDb } from "@/server/db/client";
import { zsroiOrderStatus } from "@/server/pos/zonesoft/zsroi-service";
import { authorize, readJson, zsJson, zsNoContent } from "@/server/pos/zonesoft/zsroi-http";

export const dynamic = "force-dynamic";

/** ZoneSoft (ZSROI) → MESVIO: mudança de estado de um pedido no POS (accept, decline, ready…). */
export async function POST(request: Request) {
  const claims = authorize(request);
  if (claims instanceof Response) return claims;
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const result = await zsroiOrderStatus(await getDb(), claims, read.body);
  if (!result.ok) return zsJson({ code: result.code, message: result.message }, result.status);
  return zsNoContent();
}
