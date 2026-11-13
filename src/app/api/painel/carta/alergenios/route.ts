import { z } from "zod";
import { getDb } from "@/server/db/client";
import { MENU_AI_RATE_LIMIT, suggestAllergens } from "@/server/menu/menu-ai";
import { getOwnMenu } from "@/server/menu/own-menu";
import { hitRateLimit } from "@/server/security/rate-limit";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STATUS = { NOT_CONFIGURED: 503, UNAVAILABLE: 503 } as const;
const body = z.object({ onlyMissing: z.boolean().default(true) });

/** Propõe os alergénios dos pratos com IA. Não grava nada: o dono confirma com a cozinha e guarda. */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);

  const db = await getDb();
  const menu = await getOwnMenu(db, ctx);
  if (menu === null) return json({ message: "Este restaurante usa a ementa do POS." }, 409);
  const sources = menu.categories.flatMap((c) =>
    c.products
      .filter((p) => !parsed.data.onlyMissing || p.allergens.length === 0)
      .map((p) => ({ productId: p.id, name: p.name, description: p.description, category: c.section ? `${c.section} · ${c.name}` : c.name })),
  );
  if (sources.length === 0) return json({ suggestions: [], missing: 0 });
  const limit = await hitRateLimit(db, `menu-ai:${ctx.establishmentId}`, MENU_AI_RATE_LIMIT);
  if (!limit.allowed) return json({ message: "Já pediu muitas sugestões na última hora. Tente mais tarde." }, 429);

  const result = await suggestAllergens(sources);
  if (!result.ok) return json({ code: result.code, message: result.message }, STATUS[result.code]);
  return json({ suggestions: result.suggestions, missing: result.missing });
}
