import { getDb } from "@/server/db/client";
import { createUserDirectory, InviteError, inviteErrorText } from "@/server/auth/user-directory";
import { guardStaff, json } from "@/server/staff/http";
import { inviteMember, inviteSchema, listTeam } from "@/server/staff/team-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "team.view" });
  if (ctx instanceof Response) return ctx;
  return json({ members: await listTeam(await getDb(), ctx) });
}

export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "team.view" });
  if (ctx instanceof Response) return ctx;
  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Verifique o email e o perfil." }, 400);
  const db = await getDb();
  try {
    const result = await inviteMember(db, ctx, parsed.data, createUserDirectory(db));
    return result.ok ? json({ ok: true }) : json(result, result.code === "FORBIDDEN" ? 403 : 409);
  } catch (err) {
    console.error("[equipa] convite falhou", err);
    const message = err instanceof InviteError ? inviteErrorText(err.message) : "Não foi possível enviar o convite. Tente de novo.";
    return json({ message }, 502);
  }
}
