import { z } from "zod";
import { getDb } from "@/server/db/client";
import { AI_LOCALES, suggestTranslations } from "@/server/menu/menu-ai";
import { guardPlatform } from "@/server/platform/admin-auth";
import { hitRateLimit } from "@/server/security/rate-limit";
import { json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({
  locale: z.enum(Object.keys(AI_LOCALES) as [keyof typeof AI_LOCALES, ...(keyof typeof AI_LOCALES)[]]),
  items: z
    .array(z.object({ kind: z.enum(["category", "product"]), ref: z.string().min(1).max(20), name: z.string().min(1).max(200), description: z.string().max(1000).optional() }))
    .min(1)
    .max(500),
});

/** Demonstração rápida: traduz a ementa lida para uma língua. Não grava nada. */
export async function POST(request: Request) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  const limit = await hitRateLimit(await getDb(), `central-demo-tr:${admin.userId}`, { limit: 120, windowSeconds: 60 * 60 });
  if (!limit.allowed) return json({ message: "Já fez muitas demonstrações na última hora." }, 429);
  const r = await suggestTranslations(
    parsed.data.items.map((i) => ({ ...i, context: i.kind === "category" ? "Categoria" : "Prato" })),
    parsed.data.locale,
  );
  return r.ok ? json({ suggestions: r.suggestions }) : json({ message: r.message }, 503);
}
