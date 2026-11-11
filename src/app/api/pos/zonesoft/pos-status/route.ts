import { authorize, zsJson, zsNoContent } from "@/server/pos/zonesoft/zsroi-http";

export const dynamic = "force-dynamic";

/**
 * ZoneSoft (ZSROI) → MESVIO: estado do POS. Por agora só confirma que o endpoint responde;
 * abrir e fechar a loja (PUT/DELETE em /closing) ficam registados quando houver envio de pedidos.
 */
export async function GET(request: Request) {
  const claims = authorize(request);
  if (claims instanceof Response) return claims;
  return zsJson({ status: "online" });
}

export async function POST(request: Request) {
  const claims = authorize(request);
  if (claims instanceof Response) return claims;
  return zsNoContent();
}

export const DELETE = POST;
export const PUT = POST;
