import { getDb } from "@/server/db/client";
import { getHouseSuggestions, saveHouseSuggestions } from "@/server/menu/house-suggestions";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";

/** Sugestões da casa no painel: se estão visíveis e que pratos estão escolhidos. */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  return json(await getHouseSuggestions(await getDb(), ctx.organizationId, ctx.establishmentId));
}

export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const result = await saveHouseSuggestions(await getDb(), ctx, await request.json().catch(() => null));
  return result.ok ? json(result.value) : json({ message: result.message }, 400);
}
