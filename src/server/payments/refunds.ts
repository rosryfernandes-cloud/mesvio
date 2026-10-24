import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { auditLogs, diningTables, establishments, payments } from "@/server/db/schema";
import { currentSession, loadBill } from "@/server/tables/table-sessions";
import type { StaffContext } from "@/server/staff/context";
import type { PaymentProvider } from "./provider";

type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;

export type RefundResult =
  | { ok: true; refundedCents: number }
  | { ok: false; code: "NOT_FOUND" | "NOTHING_TO_REFUND" | "PROVIDER_ERROR"; message: string };

/**
 * Devolve ao cliente o que foi pago a mais numa conta (ex.: duas pessoas pagaram ao mesmo tempo
 * e o fornecedor aceitou as duas). Dono/gerente. Usa o pagamento mais recente com saldo
 * suficiente; a chave idempotente (pagamento + total já devolvido) impede devolver duas vezes.
 */
export async function refundOverpayment(db: Db, s: Scope, tableId: string, provider: PaymentProvider, now = new Date()): Promise<RefundResult> {
  return withTenant(db, { organizationId: s.organizationId, userId: s.userId }, async (tx): Promise<RefundResult> => {
    const [table] = await tx
      .select({ id: diningTables.id, accountId: establishments.stripeAccountId })
      .from(diningTables)
      .innerJoin(establishments, eq(establishments.id, diningTables.establishmentId))
      .where(and(eq(diningTables.id, tableId), eq(diningTables.establishmentId, s.establishmentId)));
    if (!table) return { ok: false, code: "NOT_FOUND", message: "Mesa não encontrada." };
    const session = await currentSession(tx, tableId, { lock: true });
    const bill = session ? await loadBill(tx, tableId, now) : null;
    const overpaid = bill?.overpaidCents ?? 0;
    if (!session || overpaid <= 0) return { ok: false, code: "NOTHING_TO_REFUND", message: "Não há nada pago a mais nesta mesa." };

    const candidates = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.tableSessionId, session.id), eq(payments.status, "SUCCEEDED"), eq(payments.provider, provider.id)))
      .orderBy(desc(payments.createdAt));
    const p = candidates.find((c) => c.amountCents - c.refundedCents >= overpaid);
    if (!p) return { ok: false, code: "NOTHING_TO_REFUND", message: "Nenhum pagamento único cobre o valor a devolver: faça o reembolso no dashboard da Stripe." };

    try {
      await provider.refund({ providerRef: p.providerRef, accountId: table.accountId, amountCents: overpaid, idempotencyKey: `refund:${p.id}:${p.refundedCents}:${overpaid}` });
    } catch (err) {
      console.error("[pagamentos] reembolso falhou", err);
      return { ok: false, code: "PROVIDER_ERROR", message: "O fornecedor de pagamentos recusou o reembolso. Tente de novo ou use o dashboard da Stripe." };
    }
    await tx
      .update(payments)
      .set({ refundedCents: p.refundedCents + overpaid, updatedAt: now })
      .where(and(eq(payments.id, p.id), eq(payments.refundedCents, p.refundedCents)));
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: "payment.refund_overpaid",
      entityType: "payment",
      entityId: p.id,
      after: { refundedCents: overpaid },
      createdAt: now,
    });
    return { ok: true, refundedCents: overpaid };
  });
}
