import { z } from "zod";
import { getDb } from "@/server/db/client";
import { MENU_IMPORT_RATE_LIMIT } from "@/server/menu/menu-import";
import { readMenuFromLink } from "@/server/menu/menu-link";
import { getOwnMenu } from "@/server/menu/own-menu";
import { hitRateLimit } from "@/server/security/rate-limit";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STATUS = { NOT_CONFIGURED: 503, UNAVAILABLE: 503, UNREADABLE: 422, TOO_LONG: 413 } as const;

/** Lê a ementa de um link (site, PDF ou imagem) e devolve uma proposta, com as fotos dos pratos do site. Não grava nada. */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const parsed = z.object({ url: z.string().trim().min(4).max(2000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Cole o link da ementa." }, 400);
  const db = await getDb();
  if ((await getOwnMenu(db, ctx)) === null) return json({ message: "Este restaurante usa a ementa do POS." }, 409);
  const limit = await hitRateLimit(db, `menu-import:${ctx.establishmentId}`, MENU_IMPORT_RATE_LIMIT);
  if (!limit.allowed) return json({ message: "Já foram lidas muitas ementas na última hora. Tente mais tarde." }, 429);
  const result = await readMenuFromLink(parsed.data.url);
  if (!result.ok) return json({ code: result.code, message: result.message }, STATUS[result.code]);
  return json({ draft: result.draft });
}
