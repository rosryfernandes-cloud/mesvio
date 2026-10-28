import "server-only";
import { planAllowsPayments } from "@/lib/plan";
import { and, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { roundHalfUpDiv } from "@/lib/money";
import type { Db } from "@/server/db/client";
import { auditLogs, diningTables, establishments, orders, payments, tableSessions } from "@/server/db/schema";
import { resolveTableToken, withTenant } from "@/server/db/tenant";
import { currentSession, isOpen, loadBill, PENDING_STATUSES, type TableBill } from "@/server/tables/table-sessions";
import { isWellFormedTableToken } from "@/server/tables/table-token";
import { canCharge, type PaymentProvider } from "./provider";
import { ABANDONED_PAYMENT_MS, applicationFee, cancelUnpaidOrder, commissionBpsFor, syncPayment, type PaymentRow } from "./payment-records";

export { ABANDONED_PAYMENT_MS, applicationFee, PLATFORM_FEE_BPS } from "./payment-records";

export type StartPaymentResult =
  | { ok: true; paymentId: string; provider: PaymentProvider["id"]; amountCents: number; clientSecret?: string; accountId?: string }
  | {
      ok: false;
      code: "TABLE_NOT_FOUND" | "PAYMENTS_DISABLED" | "NOTHING_TO_PAY" | "PENDING_ORDERS" | "ALREADY_PAID" | "INVALID_TIP";
      message: string;
    };

const MESSAGES = {
  PAYMENTS_DISABLED: "Este restaurante ainda não aceita pagamentos pela app. Chame um funcionário.",
  NOTHING_TO_PAY: "Ainda não há nada para pagar nesta mesa.",
  PENDING_ORDERS: "Há pedidos à espera de confirmação. Aguarde um momento para pagar.",
  ALREADY_PAID: "A conta desta mesa já está paga.",
  INVALID_TIP: "Gorjeta inválida.",
} as const;

/** Gorjeta máxima: 30% da conta e nunca mais de 100 € (protege contra enganos ao escrever). */
export const maxTipCents = (dueCents: number) => Math.min(Math.floor(dueCents * 0.3), 100_00);

/**
 * Inicia o pagamento do que falta na conta da mesa. Regras (auditoria P3):
 * - o valor é sempre calculado no servidor;
 * - há no máximo UM pagamento ativo por conta: um pendente de outro valor (ex.: antes de uma nova
 *   ronda) é confirmado junto do fornecedor e, se ainda estiver pendente, cancelado lá antes de criar outro;
 * - tudo com a conta da mesa bloqueada, para dois telemóveis ao mesmo tempo não criarem dois pagamentos;
 * - a gorjeta (opcional) soma-se ao valor cobrado, vai toda para o restaurante e não paga comissão.
 */
export async function startTablePayment(
  db: Db,
  token: string,
  provider: PaymentProvider,
  now = new Date(),
  { tipCents = 0, invoice = null }: { tipCents?: number; invoice?: { nif: string | null; email: string } | null } = {},
): Promise<StartPaymentResult> {
  if (!isWellFormedTableToken(token)) return { ok: false, code: "TABLE_NOT_FOUND", message: "Mesa não encontrada." };
  const t = await resolveTableToken(db, token);
  if (!t) return { ok: false, code: "TABLE_NOT_FOUND", message: "Mesa não encontrada." };

  return withTenant(db, { organizationId: t.organizationId }, async (tx): Promise<StartPaymentResult> => {
    const [est] = await tx
      .select({ paymentsEnabled: establishments.paymentsEnabled, plan: establishments.plan, stripeAccountId: establishments.stripeAccountId })
      .from(establishments)
      .where(eq(establishments.id, t.establishmentId));
    const accountId = est.stripeAccountId;
    if (!est.paymentsEnabled || !planAllowsPayments(est.plan) || !canCharge(provider, accountId)) return { ok: false, code: "PAYMENTS_DISABLED", message: MESSAGES.PAYMENTS_DISABLED };

    const session = await currentSession(tx, t.tableId, { lock: true });
    if (!session || !isOpen(session, now)) return { ok: false, code: "NOTHING_TO_PAY", message: MESSAGES.NOTHING_TO_PAY };

    // 1) Pôr em dia os pagamentos pendentes desta conta (algum pode ter sido pago entretanto).
    const pendingRows = () =>
      tx.select().from(payments).where(and(eq(payments.tableSessionId, session.id), eq(payments.status, "PENDING")));
    for (const p of await pendingRows()) await syncPayment(tx, p, provider, accountId, now);

    let bill = (await loadBill(tx, t.tableId, now))!;
    if (bill.totalCents === 0) return { ok: false, code: "NOTHING_TO_PAY", message: MESSAGES.NOTHING_TO_PAY };
    if (bill.orders.some((o) => o.pending)) return { ok: false, code: "PENDING_ORDERS", message: MESSAGES.PENDING_ORDERS };

    if (!Number.isInteger(tipCents) || tipCents < 0 || tipCents > maxTipCents(bill.dueCents)) {
      return { ok: false, code: "INVALID_TIP", message: MESSAGES.INVALID_TIP };
    }

    // 2) Um só pagamento ativo: cancelar pendentes de outro valor ou gorjeta (se o fornecedor deixar).
    for (const p of await pendingRows()) {
      if (p.amountCents === bill.dueCents + tipCents && p.tipCents === tipCents) continue;
      if (await provider.cancel(p.providerRef, accountId)) {
        await tx.update(payments).set({ status: "CANCELLED", updatedAt: now }).where(eq(payments.id, p.id));
      } else {
        await syncPayment(tx, p, provider, accountId, now); // acabou de ser pago ou recusado
      }
    }
    bill = (await loadBill(tx, t.tableId, now))!;
    if (bill.dueCents === 0) return { ok: false, code: "ALREADY_PAID", message: MESSAGES.ALREADY_PAID };

    // 3) Comissão proporcional à parte sem IVA do valor em falta.
    const sessionOrders = await tx
      .select({ gross: orders.totalGrossCents, net: orders.totalNetCents })
      .from(orders)
      .where(and(eq(orders.tableSessionId, session.id), inArray(orders.status, ["SUBMITTED", "ACCEPTED", "IN_PREPARATION", "SERVED"])));
    const gross = sessionOrders.reduce((s, o) => s + o.gross, 0);
    const net = sessionOrders.reduce((s, o) => s + o.net, 0);
    const bps = await commissionBpsFor(tx, t.organizationId, t.establishmentId, now);
    const fee = applicationFee(gross > 0 ? roundHalfUpDiv(net * bill.dueCents, gross) : 0, bps);

    // 4) Criar (ou reaproveitar, com a mesma chave idempotente) o pagamento no fornecedor.
    const finished = await tx.$count(payments, and(eq(payments.tableSessionId, session.id), ne(payments.status, "PENDING")));
    const amountCents = bill.dueCents + tipCents;
    // Fatura pedida pelo cliente: emite-se depois de o pagamento ficar confirmado.
    const invoiceFields = invoice ? { invoiceNif: invoice.nif, invoiceEmail: invoice.email, invoiceStatus: "pending" as const } : {};
    const created = await provider.create({
      amountCents,
      applicationFeeCents: fee,
      accountId,
      // Mesma conta + mesma tentativa + mesmo valor → mesmo pagamento (toques repetidos, outro telemóvel).
      idempotencyKey: `${session.id}:${finished}:${bill.dueCents}:${tipCents}`,
      description: `${bill.tableLabel} — conta`,
      metadata: { tableSessionId: session.id, establishmentId: t.establishmentId },
    });
    const [existing] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.provider, provider.id), eq(payments.providerRef, created.providerRef)));
    const paymentId =
      existing?.id ??
      (
        await tx
          .insert(payments)
          .values({
            organizationId: t.organizationId,
            establishmentId: t.establishmentId,
            tableSessionId: session.id,
            provider: provider.id,
            providerRef: created.providerRef,
            amountCents,
            tipCents,
            applicationFeeCents: fee,
            ...invoiceFields,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: payments.id })
      )[0].id;
    // O mesmo pagamento reaproveitado (segundo toque): a fatura pedida agora também conta.
    if (existing && invoice) await tx.update(payments).set(invoiceFields).where(eq(payments.id, existing.id));
    return { ok: true, paymentId, provider: provider.id, amountCents, clientSecret: created.clientSecret, accountId: accountId ?? undefined };
  });
}

/** Pergunta ao fornecedor o estado do pagamento e atualiza o registo. Devolve a conta atualizada. */
export async function refreshTablePayment(
  db: Db,
  token: string,
  paymentId: string,
  provider: PaymentProvider,
  now = new Date(),
): Promise<{ status: string; bill: TableBill } | null> {
  if (!isWellFormedTableToken(token)) return null;
  const t = await resolveTableToken(db, token);
  if (!t) return null;

  const result = await withTenant(db, { organizationId: t.organizationId }, async (tx) => {
    const [found] = await tx
      .select({ payment: payments, stripeAccountId: establishments.stripeAccountId })
      .from(payments)
      .innerJoin(tableSessions, eq(tableSessions.id, payments.tableSessionId))
      .innerJoin(diningTables, eq(diningTables.id, tableSessions.tableId))
      .innerJoin(establishments, eq(establishments.id, diningTables.establishmentId))
      .where(and(eq(payments.id, paymentId), eq(tableSessions.tableId, t.tableId)));
    if (!found) return null;
    const synced =
      found.payment.status === "PENDING"
        ? await syncPayment(tx, found.payment, provider, found.stripeAccountId, now)
        : { status: found.payment.status, activatedOrderId: null };
    return { status: synced.status, activatedOrderId: synced.activatedOrderId, bill: (await loadBill(tx, t.tableId, now))! };
  });
  if (!result) return null;
  // Pedido pré-pago acabado de pagar: enviar já ao POS (o worker faria o mesmo em ~2 s).
  if (result.activatedOrderId) {
    const { dispatchWithinDeadline } = await import("@/server/orders/outbox-worker");
    await dispatchWithinDeadline(db, result.activatedOrderId, { label: "pagamentos" });
  }
  return { status: result.status, bill: result.bill };
}

/**
 * Reconciliação feita pelo worker (auditoria P1): o estado dos pagamentos não pode depender do
 * telemóvel do cliente voltar a perguntar. Para cada pagamento pendente, pergunta ao fornecedor;
 * os abandonados há mais de ABANDONED_PAYMENT_MS são cancelados. Tarefa de sistema (todas as
 * organizações). Com a Stripe, o webhook atualiza logo e isto serve de rede de segurança.
 */
export async function reconcilePendingPayments(
  systemDb: Db,
  provider: PaymentProvider,
  now = new Date(),
  { minAgeMs = 20_000 } = {},
): Promise<{ checked: number; changed: number; cancelled: number }> {
  const rows = await systemDb
    .select({ payment: payments, accountId: establishments.stripeAccountId })
    .from(payments)
    .innerJoin(establishments, eq(establishments.id, payments.establishmentId))
    .where(and(eq(payments.status, "PENDING"), eq(payments.provider, provider.id), lte(payments.updatedAt, new Date(now.getTime() - minAgeMs))))
    .limit(200);
  let changed = 0;
  let cancelled = 0;
  for (const { payment: p, accountId } of rows) {
    let status = (await syncPayment(systemDb, p, provider, accountId, now)).status;
    if (status === "PENDING" && now.getTime() - p.createdAt.getTime() >= ABANDONED_PAYMENT_MS) {
      if (await provider.cancel(p.providerRef, accountId)) {
        await systemDb.update(payments).set({ status: "CANCELLED", updatedAt: now }).where(and(eq(payments.id, p.id), eq(payments.status, "PENDING")));
        status = "CANCELLED";
        cancelled++;
        if (p.orderId) await cancelUnpaidOrder(systemDb, p.orderId, now, "Pagamento não concluído em 15 minutos");
      } else {
        status = (await syncPayment(systemDb, p, provider, accountId, now)).status;
      }
    } else if (status === "PENDING") {
      await systemDb.update(payments).set({ updatedAt: now }).where(eq(payments.id, p.id)); // próxima verificação mais tarde
    }
    if (status !== "PENDING") changed++;
    if (status === "SUCCEEDED") await flagOverpayment(systemDb, p.tableSessionId, p.organizationId, now);
  }
  cancelled += await expireUnpaidOrders(systemDb, now);
  return { checked: rows.length, changed, cancelled };
}

/**
 * Pedidos pré-pagos à espera de pagamento há mais de ABANDONED_PAYMENT_MS sem nenhum pagamento
 * em curso ou concluído (o cliente desistiu, ou o pagamento foi recusado e não voltou a tentar).
 */
async function expireUnpaidOrders(systemDb: Db, now: Date): Promise<number> {
  const stale = await systemDb
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.status, "AWAITING_PAYMENT"),
        lte(orders.createdAt, new Date(now.getTime() - ABANDONED_PAYMENT_MS)),
        sql`not exists (select 1 from ${payments} where ${payments.orderId} = ${orders.id} and ${payments.status} in ('PENDING', 'SUCCEEDED'))`,
      ),
    )
    .limit(200);
  let n = 0;
  for (const o of stale) if (await cancelUnpaidOrder(systemDb, o.id, now, "Não foi pago em 15 minutos")) n++;
  return n;
}

/** Pago a mais numa conta (não devia acontecer): fica registado para reembolso. */
export async function flagOverpayment(systemDb: Db, tableSessionId: string, organizationId: string, now: Date) {
  const [session] = await systemDb.select({ tableId: tableSessions.tableId }).from(tableSessions).where(eq(tableSessions.id, tableSessionId));
  const bill = session ? await loadBill(systemDb, session.tableId, now) : null;
  if (bill && bill.overpaidCents > 0) {
    await systemDb.insert(auditLogs).values({
      organizationId,
      actorType: "system",
      action: "payment.overpaid",
      entityType: "table_session",
      entityId: tableSessionId,
      after: { overpaidCents: bill.overpaidCents },
      createdAt: now,
    });
    console.error(`[pagamentos] conta ${tableSessionId} paga a mais: ${bill.overpaidCents} cêntimos — reembolsar`);
  }
}

/** Referência no fornecedor de um pagamento desta mesa (para o simulador de pagamentos em dev). */
export async function paymentProviderRef(db: Db, token: string, paymentId: string): Promise<string | null> {
  const t = await resolveTableToken(db, token);
  if (!t) return null;
  return withTenant(db, { organizationId: t.organizationId }, async (tx) => {
    const [p] = await tx
      .select({ ref: payments.providerRef })
      .from(payments)
      .innerJoin(tableSessions, eq(tableSessions.id, payments.tableSessionId))
      .where(and(eq(payments.id, paymentId), eq(tableSessions.tableId, t.tableId)));
    return p?.ref ?? null;
  });
}

export { PENDING_STATUSES };
