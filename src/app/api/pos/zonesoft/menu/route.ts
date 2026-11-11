import { getDb } from "@/server/db/client";
import { zsroiReceiveMenu } from "@/server/pos/zonesoft/zsroi-service";
import { authorize, readJson, zsJson, zsNoContent } from "@/server/pos/zonesoft/zsroi-http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** ZoneSoft (ZSROI) → MESVIO: ementa do restaurante ("Sync Menus" no ZSBMS). */
export async function POST(request: Request) {
  const claims = authorize(request);
  if (claims instanceof Response) return claims;
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const result = await zsroiReceiveMenu(await getDb(), claims, read.body);
  if (!result.ok) return zsJson({ error: result.error }, result.status);
  return zsNoContent();
}
