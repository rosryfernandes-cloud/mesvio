import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { netFromGross } from "@/lib/money";
import { ORDER_LIMITS, priceSelection } from "@/lib/order-pricing";
import type { Db } from "@/server/db/client";
import { establishments, orderEvents, orderItems, orders } from "@/server/db/schema";
import { createDbTableDirectory, type TableDirectory } from "@/server/tables/table-directory";
import { isWellFormedTableToken } from "@/server/tables/table-token";
import { hitRateLimit, ORDER_RATE_LIMITS, type RateLimitRule } from "@/server/security/rate-limit";
import { cachedPosCatalog, withLocalAvailability } from "@/server/catalog/availability";
import { withTenant } from "@/server/db/tenant";
import { getOrOpenSession } from "@/server/tables/table-sessions";
import { activePaymentProvider, canCharge } from "@/server/payments/provider";
import { loadOrderView, type OrderView } from "./order-view";
import { dispatchWithinDeadline, type WorkerDeps } from "./outbox-worker";
import { enqueueSubmit } from "./outbox";

/** O cliente envia só referências, quantidades e escolhas. Preços nunca. */
export const placeOrderInputSchema = z.object({
  tableToken: z.string(),
  idempotencyKey: z.uuid(),
  lines: z
    .array(
      z.object({
        productRef: z.string().min(1).max(64),
        quantity: z.int().min(1).max(ORDER_LIMITS.maxQuantityPerLine),
        modifierRefs: z.array(z.string().min(1).max(64)).max(20).default([]),
        notes: z.string().trim().max(ORDER_LIMITS.maxNotesLength).optional(),
      }),
    )
    .min(1)
    .max(ORDER_LIMITS.maxLines),
  notes: z.string().trim().max(ORDER_LIMITS.maxNotesLength).optional(),
  /** Total que o cliente viu. Se o preço mudou entretanto, recusamos em vez de cobrar outro valor. */
  expectedTotalCents: z.int().nonnegative().optional(),
});
export type PlaceOrderInput = z.input<typeof placeOrderInputSchema>;

export type PlaceOrderResult =
  | { ok: true; order: OrderView }
  | {
      ok: false;
      code: "INVALID_INPUT" | "TABLE_NOT_FOUND" | "ORDERING_DISABLED" | "INVALID_ITEMS" | "PRICE_CHANGED";
      message: string;
    }
  | { ok: false; code: "RATE_LIMITED"; message: string; retryAfterSeconds: number };

export interface PlaceOrderDeps extends WorkerDeps {
  db: Db;
  /** Lugares "pagar ao pedir" precisam de um fornecedor de pagamentos (por omissão, o ativo). */
  paymentsAvailable?: boolean;
  directory?: TableDirectory;
  rateLimits?: { perIp: RateLimitRule; perTable: RateLimitRule };
  /** Quanto tempo a resposta ao cliente espera pela 1.ª tentativa de envio ao POS (por omissão 4 s). */
  inlineWaitMs?: number;
  /** Mantém vivo o envio que continua depois da resposta (por omissão, `after()` do Next). */
  waitUntil?: (work: Promise<unknown>) => void;
}

export interface RequestContext {
  /** IP já pseudonimizado (hashClientIp). */
  clientIpHash: string;
}

const RATE_LIMITED_MESSAGE = "Muitos pedidos seguidos. Aguarde um pouco ou chame um funcionário.";

export async function placeOrder(raw: unknown, ctx: RequestContext, deps: PlaceOrderDeps): Promise<PlaceOrderResult> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const limits = deps.rateLimits ?? ORDER_RATE_LIMITS;

  // Antes de qualquer trabalho: trava quem martela a API, mesmo com tokens inválidos.
  const ipHit = await hitRateLimit(db, `order:ip:${ctx.clientIpHash}`, limits.perIp, now);
  if (!ipHit.allowed) return { ok: false, code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE, retryAfterSeconds: ipHit.retryAfterSeconds };

  const parsed = placeOrderInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Pedido inválido." };
  const input = parsed.data;

  if (!isWellFormedTableToken(input.tableToken)) {
    return { ok: false, code: "TABLE_NOT_FOUND", message: "Mesa não encontrada." };
  }
  const table = await (deps.directory ?? createDbTableDirectory(db, deps.resolvePos)).findActiveByToken(input.tableToken);
  if (!table) return { ok: false, code: "TABLE_NOT_FOUND", message: "Mesa não encontrada." };
  if (!table.pos.capabilities.createOrder) {
    return { ok: false, code: "ORDERING_DISABLED", message: "Este restaurante ainda não recebe pedidos pela app." };
  }
  const payFirst = table.orderingMode === "pay_first";
  if (payFirst && !(deps.paymentsAvailable ?? canCharge(activePaymentProvider(), table.stripeAccountId))) {
    return { ok: false, code: "ORDERING_DISABLED", message: "Aqui paga-se ao pedir e os pagamentos estão indisponíveis. Chame um funcionário." };
  }

  // Daqui em diante, toda a leitura/escrita fica presa a este restaurante (RLS).
  const tenant = { organizationId: table.organizationId };
  const view = async (id: string) => (await withTenant(db, tenant, (tx) => loadOrderView(tx, id)))!;

  // Recalcular tudo a partir do catálogo atual do POS.
  const catalog = withLocalAvailability(await cachedPosCatalog(table.pos, table.establishmentId), table.locallyUnavailable);
  const lines: (typeof orderItems.$inferInsert)[] = [];
  for (const line of input.lines) {
    const product = catalog.products.find((p) => p.posProductRef === line.productRef);
    if (!product) return { ok: false, code: "INVALID_ITEMS", message: "Um dos artigos já não está na ementa." };
    const priced = priceSelection(product, line.modifierRefs);
    if (!priced.ok) return { ok: false, code: "INVALID_ITEMS", message: priced.reason };
    const allMods = product.modifierGroups.flatMap((g) => g.modifiers);
    lines.push({
      organizationId: table.organizationId,
      orderId: "", // preenchido após inserir o pedido
      lineNo: lines.length + 1,
      posProductRef: product.posProductRef,
      name: product.name,
      unitPriceCents: priced.unitPriceCents,
      vatRateBps: product.vatRateBps,
      quantity: line.quantity,
      lineGrossCents: priced.unitPriceCents * line.quantity,
      notes: line.notes || null,
      modifiers: line.modifierRefs.map((ref) => {
        const m = allMods.find((x) => x.posModifierRef === ref)!;
        return { posModifierRef: ref, name: m.name, priceDeltaCents: m.priceDeltaCents };
      }),
    });
  }
  const totalGrossCents = lines.reduce((s, l) => s + l.lineGrossCents, 0);
  const totalNetCents = lines.reduce((s, l) => s + netFromGross(l.lineGrossCents, l.vatRateBps), 0);
  if (input.expectedTotalCents !== undefined && input.expectedTotalCents !== totalGrossCents) {
    return { ok: false, code: "PRICE_CHANGED", message: "Os preços foram atualizados. Reveja o pedido." };
  }

  // Repetição (duplo toque, rede instável) não conta para o limite da mesa nem cria outro pedido.
  const existing = await withTenant(db, tenant, (tx) => findByIdempotencyKey(tx, table.establishmentId, input.idempotencyKey));
  if (existing) return { ok: true, order: await view(existing) };

  const tableHit = await hitRateLimit(db, `order:table:${table.tableId}`, limits.perTable, now);
  if (!tableHit.allowed) {
    return { ok: false, code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE, retryAfterSeconds: tableHit.retryAfterSeconds };
  }

  // Aprovação pelo staff: modo manual ligado, ou pedido acima do valor-limite do restaurante (auditoria S3).
  // Nos lugares "pagar ao pedir" o limite não se aplica: o próprio pagamento prova que o pedido é real.
  const needsApproval =
    table.manualAcceptance || (!payFirst && table.approvalThresholdCents !== null && totalGrossCents > table.approvalThresholdCents);

  // Pedido + linhas + evento + tarefa de envio na MESMA transação: ou fica tudo gravado, ou nada.
  const orderId = await withTenant(db, tenant, async (tx) => {
    // Serializa pedidos do mesmo estabelecimento (número curto sequencial e idempotência sem corridas).
    await tx.select({ id: establishments.id }).from(establishments).where(eq(establishments.id, table.establishmentId)).for("update");
    const again = await findByIdempotencyKey(tx, table.establishmentId, input.idempotencyKey);
    if (again) return again;

    const [{ today }] = await tx
      .select({ today: count() })
      .from(orders)
      .where(and(eq(orders.establishmentId, table.establishmentId), gte(orders.createdAt, startOfLocalDay(now, table.timezone))));

    // Conta da mesa: o pedido junta-se à sessão aberta (ou abre uma nova).
    const tableSessionId = await getOrOpenSession(tx, table, now);

    const [order] = await tx
      .insert(orders)
      .values({
        organizationId: table.organizationId,
        establishmentId: table.establishmentId,
        tableId: table.tableId,
        tableSessionId,
        idempotencyKey: input.idempotencyKey,
        shortCode: String(today + 1).padStart(3, "0"),
        // Pagar ao pedir: o pedido existe, mas só segue para a cozinha quando o pagamento for confirmado.
        status: payFirst ? "AWAITING_PAYMENT" : "RECEIVED",
        totalGrossCents,
        totalNetCents,
        notes: input.notes || null,
        clientIpHash: ctx.clientIpHash,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: orders.id });
    await tx.insert(orderItems).values(lines.map((l) => ({ ...l, orderId: order.id })));
    await tx.insert(orderEvents).values({
      organizationId: table.organizationId,
      orderId: order.id,
      toStatus: payFirst ? "AWAITING_PAYMENT" : "RECEIVED",
      source: "customer",
      createdAt: now,
    });
    // Com aprovação (ou à espera de pagamento), a tarefa de envio só é criada mais tarde.
    if (!needsApproval && !payFirst) await enqueueSubmit(tx, table.organizationId, order.id, now);
    return order.id;
  });
  if (needsApproval || payFirst) return { ok: true, order: await view(orderId) };

  // Primeira tentativa já, para o cliente ver "Confirmado" em segundos; com um POS lento, a
  // resposta sai com "Enviado" ao fim de poucos segundos e o envio acaba em fundo.
  await dispatchWithinDeadline(db, orderId, deps);
  return { ok: true, order: await view(orderId) };
}

export { enqueueSubmit } from "./outbox";

async function findByIdempotencyKey(db: Db, establishmentId: string, key: string): Promise<string | null> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.establishmentId, establishmentId), eq(orders.idempotencyKey, key)))
    .limit(1);
  return row?.id ?? null;
}

/** Meia-noite no fuso do restaurante (para numerar os pedidos do dia: 001, 002, …). */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMs = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - offsetMs);
}
