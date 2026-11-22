import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { diningTables } from "@/server/db/schema";
import { getTableMenu } from "@/server/menu/get-table-menu";
import { placeOrder } from "@/server/orders/place-order";
import { canUseExtra } from "@/server/extras/staff-gate";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Comandeira digital: as mesas e a ementa (com preços e opções) para o empregado registar pedidos. */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "orders.act" });
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  if (!(await canUseExtra(db, ctx, "comandeira"))) return json({ message: "A comandeira digital não está ligada neste restaurante." }, 404);
  const tables = await withTenant(db, { organizationId: ctx.organizationId, userId: ctx.userId }, (tx) =>
    tx
      .select({ id: diningTables.id, label: diningTables.label, zone: diningTables.zone, token: diningTables.publicToken })
      .from(diningTables)
      .where(and(eq(diningTables.establishmentId, ctx.establishmentId), eq(diningTables.active, true)))
      .orderBy(asc(diningTables.label)),
  );
  const natural = new Intl.Collator("pt", { numeric: true });
  tables.sort((a, b) => natural.compare(a.label, b.label));
  const menu = tables[0] ? await getTableMenu(tables[0].token) : null;
  return json({
    tables: tables.map(({ token: _t, ...t }) => t),
    categories: menu?.categories ?? [],
    canOrder: menu?.ordering.enabled ?? false,
    reason: menu?.ordering.reason ?? null,
  });
}

const schema = z.object({
  tableId: z.uuid(),
  idempotencyKey: z.uuid(),
  lines: z
    .array(z.object({ productRef: z.string().min(1).max(64), quantity: z.int().min(1).max(50), modifierRefs: z.array(z.string().max(64)).max(20).default([]), notes: z.string().trim().max(200).optional() }))
    .min(1)
    .max(60),
  notes: z.string().trim().max(200).optional(),
});

/** Regista o pedido de uma mesa em nome do empregado: segue logo para a cozinha (sem aprovação nem pagamento antes). */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "orders.act" });
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  if (!(await canUseExtra(db, ctx, "comandeira"))) return json({ message: "A comandeira digital não está ligada neste restaurante." }, 404);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  const [table] = await withTenant(db, { organizationId: ctx.organizationId, userId: ctx.userId }, (tx) =>
    tx.select({ token: diningTables.publicToken }).from(diningTables).where(and(eq(diningTables.id, parsed.data.tableId), eq(diningTables.establishmentId, ctx.establishmentId))),
  );
  if (!table) return json({ message: "Mesa não encontrada." }, 404);
  const result = await placeOrder(
    { tableToken: table.token, idempotencyKey: parsed.data.idempotencyKey ?? randomUUID(), lines: parsed.data.lines, notes: parsed.data.notes },
    { clientIpHash: `staff:${ctx.userId}` },
    { db, byStaff: { userId: ctx.userId, name: ctx.displayName }, waitUntil: (w) => after(w) },
  );
  if (!result.ok) return json({ code: result.code, message: result.message }, result.code === "RATE_LIMITED" ? 429 : 422);
  return json({ order: result.order }, 201);
}
