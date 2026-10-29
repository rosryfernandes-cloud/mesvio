import "server-only";
import { effectiveOrderingMode, planAllowsPayments } from "@/lib/plan";
import { loadMenuTranslations, untranslated, type MenuTranslator } from "@/server/menu/menu-translations";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/messages";
import { and, asc, desc, eq, inArray, isNull, sql, sum } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { auditLogs, diningTables, establishments, orderEvents, orderItems, orders, outbox, payments, serviceRequests, staffProfiles, tableSessions } from "@/server/db/schema";
import { resolveTableToken, withTenant } from "@/server/db/tenant";
import type { OrderStatus } from "@/server/orders/order-view";
import type { StaffContext } from "@/server/staff/context";
import { isWellFormedTableToken } from "./table-token";
import { assignmentsEnabled, type PaidWith } from "./assignments";

/**
 * Sessões de mesa: a "conta" de um grupo de clientes, do primeiro pedido até o staff fechar a mesa.
 * Todos os pedidos da mesa nesse intervalo pertencem à mesma sessão. Fechar a mesa limpa-a para os
 * clientes seguintes. Rede de segurança: uma sessão esquecida fecha sozinha 6 h após o último pedido.
 */
export const SESSION_IDLE_MS = 6 * 3600_000;

/** Estados que ainda não chegaram à cozinha ou não foram confirmados (o fecho forçado cancela-os). */
export const PENDING_STATUSES: OrderStatus[] = ["AWAITING_PAYMENT", "RECEIVED", "SUBMITTING", "FAILED_RETRYING", "SUBMITTED", "NEEDS_ATTENTION"];
/** Estados que não contam para a conta. */
const VOID_STATUSES: OrderStatus[] = ["CANCELLED", "REJECTED"];

type Session = typeof tableSessions.$inferSelect;
export const isOpen = (s: Session, now: Date) => s.closedAt === null && s.expiresAt > now;

export async function currentSession(tx: Db, tableId: string, { lock = false } = {}): Promise<Session | null> {
  const query = tx
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.tableId, tableId), isNull(tableSessions.closedAt)))
    .orderBy(desc(tableSessions.openedAt))
    .limit(1);
  // Com lock: se o staff estiver a fechar esta mesa, esperamos; o Postgres volta a avaliar o
  // "closed_at is null" depois da espera e, se fechou, abrimos uma conta nova.
  const [s] = lock ? await query.for("update") : await query;
  return s ?? null;
}

/**
 * Sessão aberta da mesa (abre uma se não houver) e prolonga-lhe o prazo.
 * Chamar dentro da transação do pedido, que já serializa pedidos do restaurante.
 */
export async function getOrOpenSession(tx: Db, t: { organizationId: string; tableId: string }, now: Date): Promise<string> {
  const expiresAt = new Date(now.getTime() + SESSION_IDLE_MS);
  const current = await currentSession(tx, t.tableId, { lock: true });
  if (current && isOpen(current, now)) {
    await tx.update(tableSessions).set({ expiresAt }).where(eq(tableSessions.id, current.id));
    return current.id;
  }
  // Sessão esquecida que já expirou: fecha-se na hora em que expirou.
  if (current) await tx.update(tableSessions).set({ closedAt: current.expiresAt }).where(eq(tableSessions.id, current.id));
  const [created] = await tx
    .insert(tableSessions)
    .values({ organizationId: t.organizationId, tableId: t.tableId, openedAt: now, expiresAt })
    .returning({ id: tableSessions.id });
  return created.id;
}

export interface BillOrder {
  id: string;
  shortCode: string;
  status: OrderStatus;
  createdAt: string;
  totalCents: number;
  /** Ainda à espera de aprovação/confirmação (conta, mas pode mudar). */
  pending: boolean;
  /** Cancelado ou recusado (aparece riscado, não conta). */
  void: boolean;
  /** Lugar "pagar ao pedir": ainda não pago (não conta para o total nem foi para a cozinha). */
  awaitingPayment: boolean;
  lines: { name: string; quantity: number; modifierNames: string[]; lineTotalCents: number }[];
}

export interface TableBill {
  tableLabel: string;
  /** null = mesa livre (sem conta aberta). */
  openedAt: string | null;
  orders: BillOrder[];
  totalCents: number;
  /** Já pago no telemóvel (pagamentos confirmados pelo fornecedor). */
  paidCents: number;
  /** Em falta: total − pago (nunca negativo). */
  dueCents: number;
  /** Pagamentos iniciados e ainda por concluir (MB WAY à espera de aprovação, etc.). */
  pendingPaymentCents: number;
  /** Pago a mais do que o total (tem de ser reembolsado). */
  overpaidCents: number;
  /** Gorjetas deixadas nos pagamentos pelo telemóvel (fora do total e do pago). */
  tipCents: number;
  /** O restaurante aceita pagamentos na mesa. */
  paymentsEnabled: boolean;
  /** O restaurante emite fatura por email (programa de faturação ligado no painel). */
  invoicing: boolean;
  /** Avaliação no fim da conta (em teste); link do Google, se o restaurante o pôs. */
  reviews: { enabled: boolean; googleUrl: string | null };
}

export async function loadBill(tx: Db, tableId: string, now: Date, tr?: MenuTranslator): Promise<TableBill | null> {
  return (await loadBills(tx, [tableId], now, tr)).get(tableId) ?? null;
}

/**
 * Contas de várias mesas com um número FIXO de consultas (mesas, sessões, pedidos, linhas,
 * pagamentos), seja qual for o número de mesas. Antes, o painel fazia ~4 consultas por mesa
 * a cada 5 s (teste de carga).
 */
/** `tr`: nomes dos artigos na língua do cliente (o painel usa os originais). */
export async function loadBills(tx: Db, tableIds: string[], now: Date, tr: MenuTranslator = untranslated): Promise<Map<string, TableBill>> {
  const result = new Map<string, TableBill>();
  if (tableIds.length === 0) return result;
  const tables = await tx
    .select({
      id: diningTables.id,
      label: diningTables.label,
      paymentsOn: establishments.paymentsEnabled,
      plan: establishments.plan,
      invoicing: sql<boolean>`${establishments.invoicingAccount} is not null and ${establishments.invoicingApiKeyCiphertext} is not null`,
      reviewsEnabled: establishments.reviewsEnabled,
      googleReviewUrl: establishments.googleReviewUrl,
    })
    .from(diningTables)
    .innerJoin(establishments, eq(establishments.id, diningTables.establishmentId))
    .where(inArray(diningTables.id, tableIds))
    // Só o plano com pagamentos deixa pagar a conta no telemóvel.
    .then((rows) => rows.map((r) => ({ ...r, paymentsEnabled: r.paymentsOn && planAllowsPayments(r.plan) })));

  // Sessão aberta mais recente de cada mesa.
  const sessionRows = await tx
    .select()
    .from(tableSessions)
    .where(and(inArray(tableSessions.tableId, tableIds), isNull(tableSessions.closedAt)))
    .orderBy(desc(tableSessions.openedAt));
  const sessionOf = new Map<string, Session>();
  for (const sr of sessionRows) if (!sessionOf.has(sr.tableId) && isOpen(sr, now)) sessionOf.set(sr.tableId, sr);
  const sessionIds = [...sessionOf.values()].map((x) => x.id);

  const orderRows = sessionIds.length
    ? await tx
        .select({
          id: orders.id,
          sessionId: orders.tableSessionId,
          shortCode: orders.shortCode,
          status: orders.status,
          createdAt: orders.createdAt,
          totalCents: orders.totalGrossCents,
        })
        .from(orders)
        .where(inArray(orders.tableSessionId, sessionIds))
        // Desempate pelo número do pedido (sequencial no dia) para a ordem ser sempre a mesma.
        .orderBy(asc(orders.createdAt), asc(orders.shortCode))
    : [];
  const items = orderRows.length
    ? await tx.select().from(orderItems).where(inArray(orderItems.orderId, orderRows.map((r) => r.id))).orderBy(asc(orderItems.lineNo))
    : [];
  const sums = sessionIds.length
    ? await tx
        // Pago = cobrado menos a gorjeta e o que já foi devolvido ao cliente.
        .select({
          sessionId: payments.tableSessionId,
          status: payments.status,
          cents: sum(sql<number>`${payments.amountCents} - ${payments.tipCents} - ${payments.refundedCents}`),
          tips: sum(payments.tipCents),
        })
        .from(payments)
        .where(and(inArray(payments.tableSessionId, sessionIds), inArray(payments.status, ["SUCCEEDED", "PENDING"])))
        .groupBy(payments.tableSessionId, payments.status)
    : [];

  for (const table of tables) {
    const session = sessionOf.get(table.id);
    if (!session) {
      result.set(table.id, {
        tableLabel: table.label,
        openedAt: null,
        orders: [],
        totalCents: 0,
        paidCents: 0,
        dueCents: 0,
        pendingPaymentCents: 0,
        overpaidCents: 0,
        tipCents: 0,
        paymentsEnabled: table.paymentsEnabled,
        invoicing: table.invoicing,
        reviews: { enabled: table.reviewsEnabled, googleUrl: table.googleReviewUrl },
      });
      continue;
    }
    const billOrders: BillOrder[] = orderRows
      .filter((r) => r.sessionId === session.id)
      .map((r) => ({
        id: r.id,
        shortCode: r.shortCode,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        totalCents: r.totalCents,
        pending: PENDING_STATUSES.includes(r.status) && r.status !== "AWAITING_PAYMENT",
        void: VOID_STATUSES.includes(r.status),
        awaitingPayment: r.status === "AWAITING_PAYMENT",
        lines: items
          .filter((i) => i.orderId === r.id)
          .map((i) => ({
            name: tr("product", i.posProductRef, i.name).name,
            quantity: i.quantity,
            modifierNames: i.modifiers.map((m) => tr("modifier", m.posModifierRef, m.name).name),
            lineTotalCents: i.lineGrossCents,
          })),
      }));
    const totalCents = billOrders.filter((o) => !o.void && !o.awaitingPayment).reduce((acc, o) => acc + o.totalCents, 0);
    const cents = (status: string) => Number(sums.find((r) => r.sessionId === session.id && r.status === status)?.cents ?? 0);
    const paidCents = cents("SUCCEEDED");
    result.set(table.id, {
      tableLabel: table.label,
      openedAt: session.openedAt.toISOString(),
      orders: billOrders,
      totalCents,
      paidCents,
      dueCents: Math.max(0, totalCents - paidCents),
      pendingPaymentCents: cents("PENDING"),
      overpaidCents: Math.max(0, paidCents - totalCents),
      tipCents: Number(sums.find((r) => r.sessionId === session.id && r.status === "SUCCEEDED")?.tips ?? 0),
      paymentsEnabled: table.paymentsEnabled,
      invoicing: table.invoicing,
      reviews: { enabled: table.reviewsEnabled, googleUrl: table.googleReviewUrl },
    });
  }
  return result;
}

/** Conta atual da mesa, para o cliente (pelo token do QR/NFC). */
export async function getTableBillByToken(db: Db, token: string, now = new Date(), locale: Locale = DEFAULT_LOCALE): Promise<TableBill | null> {
  if (!isWellFormedTableToken(token)) return null;
  const t = await resolveTableToken(db, token);
  if (!t) return null;
  const tr = await loadMenuTranslations(db, t.organizationId, t.establishmentId, locale);
  return withTenant(db, { organizationId: t.organizationId }, (tx) => loadBill(tx, t.tableId, now, tr));
}

// ─────────────────────────── Painel ───────────────────────────

type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

export interface TableOverview {
  tableId: string;
  label: string;
  zone: string | null;
  orderingMode: "pay_later" | "pay_first";
  /** null = mesa livre. */
  bill: TableBill | null;
  /** Pedidos por resolver nesta conta (aprovar, confirmar, precisa de atenção…). */
  pendingCount: number;
  /** Chamadas abertas do cliente: pede a conta e/ou chama um empregado. */
  calls: ("bill" | "waiter" | "paid")[];
  /** Empregado responsável (mesas por empregado); null = de todos. */
  assignedUserId: string | null;
}

/** Todas as mesas do restaurante com a conta aberta de cada uma. */
export async function listTables(db: Db, s: Scope, now = new Date()): Promise<TableOverview[]> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const tables = await tx
      .select({
        id: diningTables.id,
        label: diningTables.label,
        zone: diningTables.zone,
        mode: diningTables.orderingMode,
        plan: establishments.plan,
        assignedUserId: diningTables.assignedUserId,
      })
      .from(diningTables)
      .innerJoin(establishments, eq(establishments.id, diningTables.establishmentId))
      .where(and(eq(diningTables.establishmentId, s.establishmentId), eq(diningTables.active, true)))
      .then((rows) => rows.map((r) => ({ ...r, orderingMode: effectiveOrderingMode(r.plan, r.mode) })));
    const bills = await loadBills(tx, tables.map((t) => t.id), now);
    const openCalls = tables.length
      ? await tx
          .select({ tableId: serviceRequests.tableId, kind: serviceRequests.kind })
          .from(serviceRequests)
          .where(and(eq(serviceRequests.establishmentId, s.establishmentId), isNull(serviceRequests.resolvedAt)))
      : [];
    const result: TableOverview[] = [];
    for (const t of tables) {
      const bill = bills.get(t.id);
      const open = bill?.openedAt ? bill : null;
      result.push({
        tableId: t.id,
        label: t.label,
        zone: t.zone,
        orderingMode: t.orderingMode,
        bill: open,
        pendingCount: open?.orders.filter((o) => o.pending).length ?? 0,
        calls: openCalls.filter((c) => c.tableId === t.id).map((c) => c.kind),
        assignedUserId: t.assignedUserId,
      });
    }
    // Por zona e depois em ordem natural ("Mesa 2" antes de "Mesa 10").
    const natural = (a: string, b: string) => a.localeCompare(b, "pt-PT", { numeric: true });
    return result.sort((a, b) => natural(a.zone ?? "", b.zone ?? "") || natural(a.label, b.label));
  });
}

export type CloseResult =
  /** `cancelled`: pedidos pendentes cancelados no fecho forçado; `checkInPos`: dos quais podem já estar no POS. */
  | { ok: true; cancelled: string[]; checkInPos: string[] }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_FREE" | "PENDING_PAYMENT"; message: string }
  | { ok: false; code: "PENDING_ORDERS"; message: string; pendingCount: number }
  /** Mesas por empregado: a mesa é de um colega (fecha com `override`, fica registado). */
  | { ok: false; code: "NOT_YOURS"; message: string; assignedTo: string }
  /** Mesas por empregado: falta pagar pela app; diga como foi pago ao balcão (`paidWith`). */
  | { ok: false; code: "PAID_WITH_REQUIRED"; message: string; dueCents: number };

/**
 * Fecha a conta da mesa. Com pedidos por resolver, só fecha com `force` (o staff confirmou).
 * Com as mesas por empregado ligadas: a mesa de um colega só fecha com `override`, e com valor em
 * falta só fecha dizendo como foi pago (`paidWith`), para não se fecharem contas por engano.
 */
export async function closeTable(
  db: Db,
  s: Scope & { role?: StaffContext["role"] },
  tableId: string,
  { force = false, override = false, paidWith = null, now = new Date() }: { force?: boolean; override?: boolean; paidWith?: PaidWith | null; now?: Date } = {},
): Promise<CloseResult> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [table] = await tx
      .select({ id: diningTables.id, assignedUserId: diningTables.assignedUserId })
      .from(diningTables)
      .where(and(eq(diningTables.id, tableId), eq(diningTables.establishmentId, s.establishmentId)));
    if (!table) return { ok: false, code: "NOT_FOUND", message: "Mesa não encontrada." };

    // Bloqueia a sessão: um pedido a entrar ao mesmo tempo espera, e cai na conta seguinte.
    const session = await currentSession(tx, tableId, { lock: true });
    if (!session || !isOpen(session, now)) return { ok: false, code: "ALREADY_FREE", message: "Esta mesa já está livre." };

    // Dinheiro a caminho (MB WAY por aprovar, etc.): nem o fecho forçado passa — uma aprovação depois
    // do fecho ficaria numa conta fechada e levava a cobrar outra vez ao balcão (auditoria P2).
    const paymentsInFlight = await tx.$count(payments, and(eq(payments.tableSessionId, session.id), eq(payments.status, "PENDING")));
    if (paymentsInFlight > 0) {
      return {
        ok: false,
        code: "PENDING_PAYMENT",
        message: "Há um pagamento em curso nesta mesa (ex.: MB WAY por aprovar). Aguarde que o cliente o conclua; se for abandonado, é cancelado sozinho em 15 minutos.",
      };
    }

    const assignments = await assignmentsEnabled(tx, s.establishmentId);
    const notTheirs = assignments && table.assignedUserId !== null && table.assignedUserId !== s.userId;
    if (notTheirs && s.role === "staff" && !override) {
      const [who] = await tx
        .select({ name: staffProfiles.displayName, email: staffProfiles.email })
        .from(staffProfiles)
        .where(eq(staffProfiles.userId, table.assignedUserId!));
      const assignedTo = who?.name || who?.email || "outro empregado";
      return { ok: false, code: "NOT_YOURS", assignedTo, message: `Esta mesa é de ${assignedTo}.` };
    }

    const pending = await tx.$count(orders, and(eq(orders.tableSessionId, session.id), inArray(orders.status, PENDING_STATUSES)));
    if (pending > 0 && !force) {
      return {
        ok: false,
        code: "PENDING_ORDERS",
        pendingCount: pending,
        message: pending === 1 ? "Há 1 pedido desta mesa ainda por resolver." : `Há ${pending} pedidos desta mesa ainda por resolver.`,
      };
    }
    // Valor em falta (não pago pela app): com mesas por empregado, quem fecha diz como foi pago.
    const dueCents = assignments ? ((await loadBill(tx, tableId, now))?.dueCents ?? 0) : 0;
    if (assignments && dueCents > 0 && !paidWith) {
      return { ok: false, code: "PAID_WITH_REQUIRED", dueCents, message: "Falta pagar pela app. Como pagaram?" };
    }

    // Fecho forçado: os pedidos pendentes desta conta não podem chegar à cozinha depois de os clientes
    // saírem — cancelam-se e as tarefas de envio terminam, na mesma transação (auditoria M1).
    const pendingRows = await tx
      .select({ id: orders.id, shortCode: orders.shortCode, status: orders.status })
      .from(orders)
      .where(and(eq(orders.tableSessionId, session.id), inArray(orders.status, PENDING_STATUSES)))
      .for("update");
    const cancelledRows = pendingRows.length
      ? await tx
          .update(orders)
          .set({ status: "CANCELLED", updatedAt: now })
          .where(inArray(orders.id, pendingRows.map((r) => r.id)))
          .returning({ id: orders.id, shortCode: orders.shortCode })
      : [];
    const before = new Map(pendingRows.map((r) => [r.id, r.status]));
    for (const r of cancelledRows) {
      await tx.insert(orderEvents).values({
        organizationId: s.organizationId,
        orderId: r.id,
        fromStatus: before.get(r.id),
        toStatus: "CANCELLED",
        source: "staff",
        detail: { reason: "Mesa fechada com o pedido por resolver" },
        createdAt: now,
      });
    }
    if (cancelledRows.length) {
      await tx
        .update(outbox)
        .set({ status: "DONE", lastError: "Cancelado: mesa fechada" })
        .where(
          and(
            inArray(outbox.status, ["PENDING", "DISPATCHED"]),
            inArray(sql`${outbox.payload}->>'orderId'`, cancelledRows.map((r) => r.id)),
          ),
        );
    }
    // Já enviados ou em envio podem estar no POS: o staff tem de os anular lá.
    const mayBeInPos = pendingRows.filter((r) => ["SUBMITTED", "SUBMITTING", "NEEDS_ATTENTION"].includes(r.status));

    await tx.update(tableSessions).set({ closedAt: now }).where(eq(tableSessions.id, session.id));
    // Mesa fechada: as chamadas dela ("pede a conta", "chamar empregado") ficam resolvidas.
    await tx
      .update(serviceRequests)
      .set({ resolvedAt: now })
      .where(and(eq(serviceRequests.tableId, tableId), isNull(serviceRequests.resolvedAt)));
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: "table.close",
      entityType: "table_session",
      entityId: session.id,
      after: {
        tableId,
        pendingAtClose: pending,
        cancelledOrders: cancelledRows.map((r) => r.shortCode),
        ...(assignments ? { dueCents, paidWith: dueCents > 0 ? paidWith : null, assignedUserId: table.assignedUserId } : {}),
      },
      createdAt: now,
    });
    return { ok: true, cancelled: cancelledRows.map((r) => r.shortCode), checkInPos: mayBeInPos.map((r) => r.shortCode) };
  });
}
