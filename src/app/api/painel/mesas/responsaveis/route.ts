import { z } from "zod";
import { getDb } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { guardStaff, json } from "@/server/staff/http";
import { assignmentsEnabled, clearAssignments, recentClosures, setAssignmentsEnabled } from "@/server/tables/assignments";

export const dynamic = "force-dynamic";

/** Mesas por empregado (dono/gerente): se está ligado e as mesas fechadas nas últimas 24 h. */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  const enabled = await withTenant(db, { organizationId: ctx.organizationId, userId: ctx.userId }, (tx) => assignmentsEnabled(tx, ctx.establishmentId));
  return json({ enabled, closures: enabled ? await recentClosures(db, ctx) : [] });
}

const schema = z.union([z.object({ enabled: z.boolean() }), z.object({ clear: z.literal(true) })]);

/** Ligar/desligar ({ enabled }) ou fim de turno: tirar todos os responsáveis ({ clear: true }). */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  const db = await getDb();
  if ("clear" in parsed.data) return json({ ok: true, cleared: await clearAssignments(db, ctx) });
  await setAssignmentsEnabled(db, ctx, parsed.data.enabled);
  return json({ ok: true });
}
