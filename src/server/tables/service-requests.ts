import "server-only";
import { effectiveOrderingMode, planAllowsOrdering } from "@/lib/plan";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { diningTables, establishments, serviceRequests } from "@/server/db/schema";
import { resolveTableToken, withTenant } from "@/server/db/tenant";
import { hitRateLimit, type RateLimitRule } from "@/server/security/rate-limit";
import type { StaffContext } from "@/server/staff/context";
import { loadBills } from "./table-sessions";
import { queueTableEvent } from "@/server/notifications/push";
import { isWellFormedTableToken } from "./table-token";

/**
 * Chamadas do cliente ao staff: "Pedir a conta" (com o meio de pagamento) e "Chamar empregado"
 * (com o motivo). Uma chamada aberta por tipo e mesa: carregar outra vez só atualiza o detalhe,
 * não enche o painel. Fecham quando o staff as dá por feitas ou fecha a mesa.
 * "paid" não vem do cliente: é o aviso ao painel de que a mesa pagou a conta pelo telemóvel.
 */
export type ServiceRequestKind = "bill" | "waiter" | "paid";
export type CustomerCallKind = Exclude<ServiceRequestKind, "paid">;
export const BILL_DETAILS = ["card", "cash"] as const;
export const WAITER_DETAILS = ["order", "napkins", "clear", "other"] as const;

export const serviceRequestInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bill"), detail: z.enum(BILL_DETAILS) }),
  z.object({ kind: z.literal("waiter"), detail: z.enum(WAITER_DETAILS) }),
]);
export type ServiceRequestInput = z.infer<typeof serviceRequestInputSchema>;

/** Por mesa: chega para uma refeição (várias pessoas, várias chamadas) e trava abusos de quem tem o QR. */
export const CALL_RATE_LIMITS = {
  perTable: { limit: 12, windowSeconds: 15 * 60 },
  perIp: { limit: 120, windowSeconds: 15 * 60 },
} satisfies Record<string, RateLimitRule>;

/** Estado das chamadas abertas de uma mesa, para o cliente. */
export interface TableCall {
  kind: CustomerCallKind;
  detail: string | null;
  /** O staff carregou em "A caminho". */
  acknowledged: boolean;
}

type CreateResult =
  | { ok: true; calls: TableCall[] }
  | { ok: false; code: "INVALID_INPUT" | "TABLE_NOT_FOUND" | "NOT_ALLOWED" | "RATE_LIMITED"; message: string; retryAfterSeconds?: number };

const tableKey = (token: string) => createHash("sha256").update(token).digest("base64url").slice(0, 22);

async function openCallsOf(tx: Db, tableId: string): Promise<TableCall[]> {
  const rows = await tx
    .select({ kind: serviceRequests.kind, detail: serviceRequests.detail, acknowledgedAt: serviceRequests.acknowledgedAt })
    .from(serviceRequests)
    .where(and(eq(serviceRequests.tableId, tableId), inArray(serviceRequests.kind, ["bill", "waiter"]), isNull(serviceRequests.resolvedAt)))
    .orderBy(asc(serviceRequests.createdAt));
  return rows.map((r) => ({ kind: r.kind as CustomerCallKind, detail: r.detail, acknowledged: r.acknowledgedAt !== null }));
}

/** O cliente (com o QR/NFC da mesa) pede a conta ou chama um empregado. */
export async function createServiceRequest(
  db: Db,
  token: string,
  raw: unknown,
  { ipHash, now = new Date() }: { ipHash: string; now?: Date },
): Promise<CreateResult> {
  const parsed = serviceRequestInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Pedido inválido." };
  if (!isWellFormedTableToken(token)) return { ok: false, code: "TABLE_NOT_FOUND", message: "Mesa não encontrada." };
  const t = await resolveTableToken(db, token);
  if (!t) return { ok: false, code: "TABLE_NOT_FOUND", message: "Mesa não encontrada." };

  for (const [key, rule] of [
    [`call:table:${tableKey(token)}`, CALL_RATE_LIMITS.perTable],
    [`call:ip:${ipHash}`, CALL_RATE_LIMITS.perIp],
  ] as const) {
    const r = await hitRateLimit(db, key, rule, now);
    if (!r.allowed) {
      return { ok: false, code: "RATE_LIMITED", message: "Já chamámos o staff. Aguarde um momento.", retryAfterSeconds: r.retryAfterSeconds };
    }
  }

  const { kind, detail } = parsed.data;
  return withTenant(db, { organizationId: t.organizationId }, async (tx) => {
    const [table] = await tx
      .select({ active: diningTables.active, orderingMode: diningTables.orderingMode, plan: establishments.plan })
      .from(diningTables)
      .innerJoin(establishments, eq(establishments.id, diningTables.establishmentId))
      .where(eq(diningTables.id, t.tableId));
    if (!table?.active) return { ok: false, code: "TABLE_NOT_FOUND", message: "Mesa não encontrada." };
    // Plano só com a ementa: não há chamadas ao staff pela app.
    if (!planAllowsOrdering(table.plan)) return { ok: false, code: "NOT_ALLOWED", message: "Chame um funcionário." };
    // Nos lugares que pagam ao pedir (camas) não há conta para pedir.
    if (kind === "bill" && effectiveOrderingMode(table.plan, table.orderingMode) === "pay_first") {
      return { ok: false, code: "NOT_ALLOWED", message: "Aqui paga ao pedir: não há conta por pagar." };
    }
    const [open] = await tx
      .select({ id: serviceRequests.id })
      .from(serviceRequests)
      .where(and(eq(serviceRequests.tableId, t.tableId), eq(serviceRequests.kind, kind), isNull(serviceRequests.resolvedAt)))
      .limit(1)
      .for("update");
    if (open) {
      // Já há uma chamada deste tipo: atualiza o detalhe (ex.: mudou de cartão para dinheiro).
      await tx.update(serviceRequests).set({ detail }).where(eq(serviceRequests.id, open.id));
    } else {
      await tx.insert(serviceRequests).values({
        organizationId: t.organizationId,
        establishmentId: t.establishmentId,
        tableId: t.tableId,
        kind,
        detail,
        createdAt: now,
      });
    }
    return { ok: true, calls: await openCallsOf(tx, t.tableId) };
  });
}

/** Chamadas abertas da mesa, para o cliente ver "Chamado" / "A caminho". */
export async function getTableCalls(db: Db, token: string): Promise<TableCall[] | null> {
  if (!isWellFormedTableToken(token)) return null;
  const t = await resolveTableToken(db, token);
  if (!t) return null;
  return withTenant(db, { organizationId: t.organizationId }, (tx) => openCallsOf(tx, t.tableId));
}

// ─────────────────────────── Painel ───────────────────────────

type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;

export interface BoardCall {
  id: string;
  tableId: string;
  tableLabel: string;
  zone: string | null;
  kind: ServiceRequestKind;
  detail: string | null;
  createdAt: string;
  acknowledged: boolean;
  /** Pedir a conta / pagou: total por pagar da mesa (para levar o terminal ou o troco certo). */
  dueCents?: number;
  /** Pagou pelo telemóvel: valor cobrado (com a gorjeta) e a gorjeta. */
  paidCents?: number;
  tipCents?: number;
}

/** Aviso "pagou pelo telemóvel": o detalhe guarda "cobrado:gorjeta" em cêntimos. */
const paidDetail = (amountCents: number, tipCents: number) => `${amountCents}:${tipCents}`;
function parsePaidDetail(detail: string | null): { paidCents: number; tipCents: number } {
  const [a, t] = (detail ?? "").split(":").map(Number);
  return { paidCents: Number.isFinite(a) ? a : 0, tipCents: Number.isFinite(t) ? t : 0 };
}

/**
 * A mesa pagou a conta (ou parte) pelo telemóvel: avisa o painel (com som, como as chamadas) e, se
 * já não falta nada, dá por resolvido o "Pedir a conta" que estivesse aberto.
 */
export async function notifyTablePaid(
  tx: Db,
  t: { organizationId: string; establishmentId: string; tableId: string },
  amountCents: number,
  tipCents: number,
  now: Date,
): Promise<void> {
  await tx.insert(serviceRequests).values({ ...t, kind: "paid", detail: paidDetail(amountCents, tipCents), createdAt: now });
  queueTableEvent(t, { kind: "paid", amountCents });
  const bill = (await loadBills(tx, [t.tableId], now)).get(t.tableId);
  if (bill && bill.dueCents === 0) {
    await tx
      .update(serviceRequests)
      .set({ resolvedAt: now })
      .where(and(eq(serviceRequests.tableId, t.tableId), eq(serviceRequests.kind, "bill"), isNull(serviceRequests.resolvedAt)));
  }
}

/** Chamadas abertas do restaurante, mais antigas primeiro (dentro de uma transação com o tenant). */
export async function loadOpenCalls(tx: Db, establishmentId: string, now: Date): Promise<BoardCall[]> {
  const rows = await tx
    .select({
      id: serviceRequests.id,
      tableId: serviceRequests.tableId,
      tableLabel: diningTables.label,
      zone: diningTables.zone,
      kind: serviceRequests.kind,
      detail: serviceRequests.detail,
      createdAt: serviceRequests.createdAt,
      acknowledgedAt: serviceRequests.acknowledgedAt,
    })
    .from(serviceRequests)
    .innerJoin(diningTables, eq(diningTables.id, serviceRequests.tableId))
    .where(and(eq(serviceRequests.establishmentId, establishmentId), isNull(serviceRequests.resolvedAt)))
    .orderBy(asc(serviceRequests.createdAt));
  const billTables = [...new Set(rows.filter((r) => r.kind !== "waiter").map((r) => r.tableId))];
  const bills = billTables.length ? await loadBills(tx, billTables, now) : new Map();
  return rows.map((r) => ({
    id: r.id,
    tableId: r.tableId,
    tableLabel: r.tableLabel,
    zone: r.zone,
    kind: r.kind,
    detail: r.detail,
    createdAt: r.createdAt.toISOString(),
    acknowledged: r.acknowledgedAt !== null,
    dueCents: r.kind !== "waiter" ? (bills.get(r.tableId)?.dueCents ?? 0) : undefined,
    ...(r.kind === "paid" ? parsePaidDetail(r.detail) : {}),
  }));
}

export type CallAction = "ack" | "done";
export const CALL_ACTIONS: CallAction[] = ["ack", "done"];

/** Staff: "A caminho" (o cliente vê-o) ou "Feito" (a chamada sai do painel). */
export async function actOnCall(db: Db, s: Scope, id: string, action: CallAction, now = new Date()): Promise<boolean> {
  return withTenant(db, { organizationId: s.organizationId, userId: s.userId }, async (tx) => {
    const set = action === "ack" ? { acknowledgedAt: now } : { resolvedAt: now };
    const updated = await tx
      .update(serviceRequests)
      .set(set)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.establishmentId, s.establishmentId), isNull(serviceRequests.resolvedAt)))
      .returning({ id: serviceRequests.id });
    return updated.length > 0;
  });
}
