import { getDb } from "@/server/db/client";
import { MENU_AI_RATE_LIMIT, suggestDescriptions } from "@/server/menu/menu-ai";
import { getOwnMenu } from "@/server/menu/own-menu";
import { hitRateLimit } from "@/server/security/rate-limit";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STATUS = { NOT_CONFIGURED: 503, UNAVAILABLE: 503 } as const;

/** Propõe descrições com IA para os pratos que ainda não têm. Não grava nada: o dono revê e guarda. */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  const menu = await getOwnMenu(db, ctx);
  if (menu === null) return json({ message: "Este restaurante usa a ementa do POS." }, 409);
  const sources = menu.categories.flatMap((c) =>
    c.products.filter((p) => !p.description).map((p) => ({ productId: p.id, name: p.name, category: c.section ? `${c.section} · ${c.name}` : c.name })),
  );
  if (sources.length === 0) return json({ suggestions: [], skipped: 0 });
  const limit = await hitRateLimit(db, `menu-ai:${ctx.establishmentId}`, MENU_AI_RATE_LIMIT);
  if (!limit.allowed) return json({ message: "Já pediu muitas sugestões na última hora. Tente mais tarde." }, 429);
  const result = await suggestDescriptions(sources);
  if (!result.ok) return json({ code: result.code, message: result.message }, STATUS[result.code]);
  return json({ suggestions: result.suggestions, skipped: result.skipped });
}
