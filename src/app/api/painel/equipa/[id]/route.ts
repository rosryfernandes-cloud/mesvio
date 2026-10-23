import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { changeRole, removeMember, type TeamResult } from "@/server/staff/team-service";

export const dynamic = "force-dynamic";

const STATUS: Record<Exclude<TeamResult, { ok: true }>["code"], number> = { FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, LAST_OWNER: 409 };
const reply = (r: TeamResult) => (r.ok ? json({ ok: true }) : json(r, STATUS[r.code]));

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await guardStaff(request, { mutating: true, permission: "team.view" });
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const parsed = z.object({ role: z.enum(["owner", "manager", "staff"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return json({ message: "Pedido inválido." }, 400);
  return reply(await changeRole(await getDb(), ctx, id, parsed.data.role));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await guardStaff(request, { mutating: true, permission: "team.view" });
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Pedido inválido." }, 400);
  return reply(await removeMember(await getDb(), ctx, id));
}
