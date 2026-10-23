import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { listTranslatable, saveTranslations, TRANSLATION_LOCALES, translationChangesSchema } from "@/server/staff/translations-service";

export const dynamic = "force-dynamic";

/** Traduções da ementa (dono/gerente): GET ?lang=en lista; POST grava alterações. */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const lang = new URL(request.url).searchParams.get("lang");
  const locale = TRANSLATION_LOCALES.find((l) => l === lang);
  if (!locale) return json({ message: "Língua inválida." }, 400);
  return json({ items: await listTranslatable(await getDb(), ctx, locale) });
}

export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const parsed = translationChangesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  return json(await saveTranslations(await getDb(), ctx, parsed.data));
}
