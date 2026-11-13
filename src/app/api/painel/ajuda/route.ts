import { getDb } from "@/server/db/client";
import { answerPanelQuestion, PANEL_HELP_RATE_LIMIT, panelHelpInputSchema } from "@/server/ai/panel-help";
import { hitRateLimit } from "@/server/security/rate-limit";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Precisa de ajuda?": responde a perguntas sobre como usar o painel. Qualquer pessoa da equipa. */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true });
  if (ctx instanceof Response) return ctx;
  const parsed = panelHelpInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Escreva a sua pergunta." }, 400);
  const limit = await hitRateLimit(await getDb(), `panel-help:${ctx.userId}`, PANEL_HELP_RATE_LIMIT);
  if (!limit.allowed) return json({ message: "Já fez muitas perguntas na última hora. Tente mais tarde." }, 429);
  const r = await answerPanelQuestion(parsed.data);
  return r.ok ? json({ answer: r.answer }) : json({ message: r.message }, 503);
}
