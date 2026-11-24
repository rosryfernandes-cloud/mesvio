import { getDb } from "@/server/db/client";
import { answerCentralQuestion, CENTRAL_ASSISTANT_RATE_LIMIT, centralAssistantInputSchema } from "@/server/ai/central-assistant";
import { guardPlatform } from "@/server/platform/admin-auth";
import { hitRateLimit } from "@/server/security/rate-limit";
import { json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Ajudante da Central: responde com os dados reais da plataforma. Só a equipa MESVIO; só lê. */
export async function POST(request: Request) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const parsed = centralAssistantInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Escreve a tua pergunta." }, 400);
  const db = await getDb();
  const limit = await hitRateLimit(db, `central-assistant:${admin.userId}`, CENTRAL_ASSISTANT_RATE_LIMIT);
  if (!limit.allowed) return json({ message: "Muitas perguntas na última hora. Tenta mais tarde." }, 429);
  const r = await answerCentralQuestion(db, parsed.data);
  return r.ok ? json({ answer: r.answer }) : json({ message: r.message }, 503);
}
