import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { diningTables, serviceRequests } from "@/server/db/schema";
import { resolveTableToken, withTenant } from "@/server/db/tenant";
import { hitRateLimit, type RateLimitRule } from "@/server/security/rate-limit";
import type { StaffContext } from "@/server/staff/context";
import { loadBills } from "./table-sessions";
import { isWellFormedTableToken } from "./table-token";

/**
 * Chamadas do cliente ao staff: "Pedir a conta" (com o meio de pagamento) e "Chamar empregado"
 * (com o motivo). Uma chamada aberta por tipo e mesa: carregar outra vez só atualiza o detalhe,
 * não enche o painel. Fecham quando o staff as dá por feitas ou fecha a mesa.
 */
export type ServiceRequestKind = "bill" | "waiter";
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
  kind: ServiceRequestKind;
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
    .where(and(eq(serviceRequests.tableId, tableId), isNull(serviceRequests.resolvedAt)))
    .orderBy(asc(serviceRequests.createdAt));
  return rows.map((r) => ({ kind: r.kind, detail: r.detail, acknowledged: r.acknowledgedAt !== null }));
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
      .select({ active: diningTables.active, orderingMode: diningTables.orderingMode })
      .from(diningTables)
      .where(eq(diningTables.id, t.tableId));
    if (!table?.active) return { ok: false, code: "TABLE_NOT_FOUND", message: "Mesa não encontrada." };
    // Nos lugares que pagam ao pedir (camas) não há conta para pedir.
    if (kind === "bill" && table.orderingMode === "pay_first") {
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
  /** Pedir a conta: total por pagar da mesa (para levar o terminal ou o troco certo). */
  dueCents?: number;
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
  const billTables = [...new Set(rows.filter((r) => r.kind === "bill").map((r) => r.tableId))];
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
    dueCents: r.kind === "bill" ? (bills.get(r.tableId)?.dueCents ?? 0) : undefined,
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
