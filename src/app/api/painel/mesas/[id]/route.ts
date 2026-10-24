import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { closeTable } from "@/server/tables/table-sessions";
import { staffTableAction } from "@/server/tables/table-admin";
import { activePaymentProvider } from "@/server/payments/provider";
import { refundOverpayment } from "@/server/payments/refunds";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("close"), force: z.boolean().optional() }),
  z.object({ action: z.literal("rotate_qr") }),
  z.object({ action: z.literal("refund_overpaid") }),
]);

/** Fechar a conta de uma mesa (staff); gerar um QR novo ou devolver o pago a mais (dono/gerente). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return json({ message: "Pedido inválido." }, 400);

  if (parsed.data.action === "refund_overpaid") {
    const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
    if (ctx instanceof Response) return ctx;
    const provider = activePaymentProvider();
    if (!provider) return json({ message: "Pagamentos indisponíveis." }, 503);
    const r = await refundOverpayment(await getDb(), ctx, id, provider);
    return r.ok ? json(r) : json(r, r.code === "NOT_FOUND" ? 404 : r.code === "PROVIDER_ERROR" ? 502 : 409);
  }

  if (parsed.data.action === "rotate_qr") {
    const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
    if (ctx instanceof Response) return ctx;
    const ok = await staffTableAction(await getDb(), ctx, id, "rotate_qr");
    return ok ? json({ ok: true }) : json({ message: "Lugar não encontrado." }, 404);
  }

  const ctx = await guardStaff(request, { mutating: true, permission: "orders.act" });
  if (ctx instanceof Response) return ctx;
  const r = await closeTable(await getDb(), ctx, id, { force: parsed.data.force });
  if (r.ok) return json({ ok: true });
  return json(r, r.code === "NOT_FOUND" ? 404 : 409);
}
