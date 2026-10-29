import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { listTables } from "@/server/tables/table-sessions";
import { getPaymentsSetting } from "@/server/staff/staff-service";
import { assignableStaff, assignmentsEnabled } from "@/server/tables/assignments";
import { withTenant } from "@/server/db/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "orders.act" });
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  const payments = await getPaymentsSetting(db, ctx);
  const assignments = await withTenant(db, { organizationId: ctx.organizationId, userId: ctx.userId }, (tx) => assignmentsEnabled(tx, ctx.establishmentId));
  return json({
    tables: await listTables(db, ctx),
    paymentsEnabled: payments.enabled,
    paymentsInPlan: payments.planAllows,
    // Mesas por empregado (em teste): quem sou eu e os nomes da equipa, para "as minhas mesas".
    assignments: assignments ? { me: ctx.userId, staff: await assignableStaff(db, ctx) } : null,
  });
}
