import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { applyStaffAction, STAFF_ACTIONS, type StaffAction } from "@/server/staff/staff-service";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(STAFF_ACTIONS as [StaffAction, ...StaffAction[]]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await guardStaff(request, { mutating: true, permission: "orders.act" });
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return json({ message: "Ação inválida." }, 400);

  const result = await applyStaffAction(await getDb(), ctx, id, parsed.data.action);
  if (result.ok) return json({ ok: true });
  return json({ code: result.code, message: result.message }, result.code === "NOT_FOUND" ? 404 : 409);
}
