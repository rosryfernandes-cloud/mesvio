import { getDb } from "@/server/db/client";
import { zsroiLogin } from "@/server/pos/zonesoft/zsroi-service";
import { readJson, zsJson } from "@/server/pos/zonesoft/zsroi-http";

export const dynamic = "force-dynamic";

/** ZoneSoft (ZSROI) → MESVIO: autenticação com o APP-KEY e o APP-SECRET do cliente; devolve o token. */
export async function POST(request: Request) {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const result = await zsroiLogin(await getDb(), read.body);
  if (!result.ok) return zsJson({ error: result.status === 401 ? "Invalid credentials" : "Bad request" }, result.status);
  const token = { access_token: result.accessToken, expires_in: result.expiresIn };
  // O manual mostra a resposta dentro de "body"; enviamos as duas formas para servir em qualquer leitura.
  return zsJson({ ...token, body: token });
}
