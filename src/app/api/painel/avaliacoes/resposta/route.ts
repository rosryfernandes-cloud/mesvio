import { getDb } from "@/server/db/client";
import { REVIEW_REPLY_RATE_LIMIT, reviewReplyInputSchema, suggestReviewReply } from "@/server/reviews/reply-ai";
import { hitRateLimit } from "@/server/security/rate-limit";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Rascunho de resposta a uma avaliação colada pelo dono. Não publica nada. */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const parsed = reviewReplyInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Cole o texto da avaliação." }, 400);
  const limit = await hitRateLimit(await getDb(), `review-reply:${ctx.establishmentId}`, REVIEW_REPLY_RATE_LIMIT);
  if (!limit.allowed) return json({ message: "Já pediu muitas respostas na última hora. Tente mais tarde." }, 429);
  const r = await suggestReviewReply({ ...parsed.data, restaurant: ctx.establishmentName });
  return r.ok ? json({ reply: r.reply }) : json({ message: r.message }, 503);
}
