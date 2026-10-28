import { getDb } from "@/server/db/client";
import { guardStaff, json } from "@/server/staff/http";
import { getBillingStatus } from "@/server/billing/subscriptions";
import { stripeClient } from "@/server/payments/stripe-provider";

export const dynamic = "force-dynamic";

/** Mensalidade MESVIO do restaurante (dono/gerente veem; só o dono a ativa). */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const stripe = process.env.STRIPE_SECRET_KEY ? stripeClient() : null;
  const status = await getBillingStatus(await getDb(), ctx, stripe);
  return json({ ...status, available: Boolean(stripe), canManage: ctx.role === "owner" });
}
