import { z } from "zod";
import { getDb } from "@/server/db/client";
import { MENU_AI_RATE_LIMIT, suggestTranslations } from "@/server/menu/menu-ai";
import { hitRateLimit } from "@/server/security/rate-limit";
import { guardStaff, json } from "@/server/staff/http";
import { listTranslatable, TRANSLATION_LOCALES } from "@/server/staff/translations-service";

export const dynamic = "force-dynamic";
/** Uma ementa grande traduz-se em lotes em paralelo: pode demorar perto de um minuto. */
export const maxDuration = 120;

const STATUS = { NOT_CONFIGURED: 503, UNAVAILABLE: 503 } as const;
const body = z.object({ locale: z.enum(TRANSLATION_LOCALES) });

/** Propõe traduções com IA para o que ainda não está traduzido. Não grava nada: o dono revê e guarda. */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);

  const db = await getDb();
  const missing = (await listTranslatable(db, ctx, parsed.data.locale)).filter((i) => !i.translated);
  if (missing.length === 0) return json({ suggestions: [], missing: 0 });
  const limit = await hitRateLimit(db, `menu-ai:${ctx.establishmentId}`, MENU_AI_RATE_LIMIT);
  if (!limit.allowed) return json({ message: "Já pediu muitas sugestões na última hora. Tente mais tarde." }, 429);

  const result = await suggestTranslations(
    missing.map((i) => ({ kind: i.kind, ref: i.ref, context: i.context, name: i.original.name, description: i.original.description })),
    parsed.data.locale,
  );
  if (!result.ok) return json({ code: result.code, message: result.message }, STATUS[result.code]);
  return json({ suggestions: result.suggestions, missing: result.missing });
}
