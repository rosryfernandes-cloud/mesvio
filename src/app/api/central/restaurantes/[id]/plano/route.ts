import { z } from "zod";
import { getDb } from "@/server/db/client";
import { json } from "@/server/staff/http";
import { guardPlatform } from "@/server/platform/admin-auth";
import { setPlan } from "@/server/platform/platform-service";
import { applyPlanToSubscription } from "@/server/billing/subscriptions";
import { stripeClient } from "@/server/payments/stripe-provider";

export const dynamic = "force-dynamic";

/** Mudar o plano do restaurante ({ plan: "menu" | "orders" | "payments" }). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guardPlatform(request, { mutating: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ message: "Restaurante não encontrado." }, 404);
  const body = (await request.json().catch(() => null)) as { plan?: unknown } | null;
  const db = await getDb();
  const result = await setPlan(db, admin, id, body?.plan);
  if (!result.ok) return json(result, result.code === "NOT_FOUND" ? 404 : 400);
  // Com mensalidade ativa, a subscrição passa a cobrar o valor do novo plano.
  let subscription: "updated" | "none" | "failed" = "none";
  try {
    subscription = await applyPlanToSubscription(db, id, result.plan, process.env.STRIPE_SECRET_KEY ? stripeClient() : null);
  } catch (err) {
    console.error("[subscrição] mudar o valor falhou", err);
    subscription = "failed";
  }
  return json({ ...result, subscription });
}
