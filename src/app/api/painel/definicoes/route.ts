import { z } from "zod";
import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { setApprovalThreshold, setManualAcceptance, setPaymentsEnabled } from "@/server/staff/staff-service";
import { getConnectStatus } from "@/server/payments/stripe-connect";

export const dynamic = "force-dynamic";

const schema = z.object({
  manualAcceptance: z.boolean().optional(),
  paymentsEnabled: z.boolean().optional(),
  /** Cêntimos, ou null para desligar. */
  approvalThresholdCents: z.int().min(500).max(10_000_000).nullable().optional(),
});

export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Pedido inválido." }, 400);
  const db = await getDb();
  if (parsed.data.manualAcceptance !== undefined) await setManualAcceptance(db, ctx, parsed.data.manualAcceptance);
  if (parsed.data.paymentsEnabled !== undefined) {
    // Com a Stripe, só se ligam pagamentos com a conta do restaurante verificada.
    if (parsed.data.paymentsEnabled && process.env.STRIPE_SECRET_KEY && !(await getConnectStatus(db, ctx)).chargesEnabled) {
      return json({ message: "Ligue primeiro a conta Stripe do restaurante (o dono, no separador Mesas)." }, 409);
    }
    await setPaymentsEnabled(db, ctx, parsed.data.paymentsEnabled);
  }
  if (parsed.data.approvalThresholdCents !== undefined) await setApprovalThreshold(db, ctx, parsed.data.approvalThresholdCents);
  return json({ ok: true });
}
