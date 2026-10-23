import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatformPreMfa, platformCookie, verifyMfa } from "@/server/platform/admin-auth";

export const dynamic = "force-dynamic";

/** Entrar no painel central: código atual da app de autenticação. */
export async function POST(request: Request) {
  const admin = await guardPlatformPreMfa(request);
  if (admin instanceof Response) return admin;
  const parsed = z.object({ codigo: z.string().regex(/^\d{6}$/) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "O código tem 6 dígitos." }, 400);
  const result = await verifyMfa(await getDb(), admin, parsed.data.codigo);
  if (!result.ok) return json({ code: result.code, message: result.message }, result.code === "RATE_LIMITED" ? 429 : 401);
  const res = json({ ok: true });
  const c = platformCookie(admin.userId);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
