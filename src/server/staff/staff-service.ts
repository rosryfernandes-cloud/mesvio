import "server-only";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { auditLogs, categories, diningTables, establishments, orderEvents, orderItems, orders, outbox, posIntegrations, products, tableSessions } from "@/server/db/schema";
import type { Station } from "@/lib/station";
import { listLocallyUnavailable, setLocallyUnavailable } from "@/server/catalog/availability";
import { enqueueSubmit, startOfLocalDay } from "@/server/orders/place-order";
import { dispatchWithinDeadline, SUBMIT_ORDER_TOPIC, type WorkerDeps } from "@/server/orders/outbox-worker";
import type { OrderStatus } from "@/server/orders/order-view";
import { resolvePosAdapter, type PosResolver } from "@/server/pos/registry";
import { withTenant } from "@/server/db/tenant";
import { loadOpenCalls, type BoardCall } from "@/server/tables/service-requests";
import type { StaffContext } from "./context";

/** O que os serviços do painel precisam de saber de quem age. */
export type StaffScope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;
const tenantOf = (s: StaffScope) => ({ organizationId: s.organizationId, userId: s.userId });

// ─────────────────────────── Quadro de pedidos ───────────────────────────

const ACTIVE: OrderStatus[] = ["RECEIVED", "SUBMITTING", "FAILED_RETRYING", "SUBMITTED", "NEEDS_ATTENTION"];

export interface BoardOrder {
  id: string;
  shortCode: string;
  tableLabel: string;
  status: OrderStatus;
  /** Pedido parado à espera de aprovação do staff (modo manual ou valor acima do limite). */
  awaitingApproval: boolean;
  /** Porque espera aprovação, quando não é o modo manual (ex.: valor acima do limite). */
  approvalReason?: string;
  /** Pedido grande (≥ 150 €): só uma etiqueta para o staff reparar, não bloqueia nada. */
  highValue: boolean;
  createdAt: string;
  totalCents: number;
  notes?: string;
  /** Último motivo de falha/recusa do POS, para o staff perceber o que aconteceu. */
  problem?: string;
  /** O POS pode ter recebido o pedido (timeout/ligação caiu): verificar no POS antes de reenviar. */
  ambiguous: boolean;
  /** `station`: posto que prepara o artigo (talão da cozinha ou do bar). */
  lines: { name: string; quantity: number; modifierNames: string[]; notes?: string; station: Station }[];
}

/** A partir deste valor o painel mostra a etiqueta "Valor alto" (sem bloquear o pedido). */
export const HIGH_VALUE_CENTS = 15_000;

export interface Board {
  establishmentName: string;
  manualAcceptance: boolean;
  /** Limite opcional acima do qual os pedidos esperam aprovação (null = desligado). */
  approvalThresholdCents: number | null;
  orders: BoardOrder[];
  /** Clientes que pedem a conta ou chamam um empregado (mais antigos primeiro). */
  calls: BoardCall[];
}

/** Pedidos de hoje + qualquer pedido ainda por resolver (mesmo de ontem). */
export async function getBoard(root: Db, s: StaffScope, now = new Date()): Promise<Board> {
  return withTenant(root, tenantOf(s), (db) => loadBoard(db, s, now));
}

async function loadBoard(db: Db, s: StaffScope, now: Date): Promise<Board> {
  const [est] = await db
    .select({
      name: establishments.name,
      manualAcceptance: establishments.manualAcceptance,
      timezone: establishments.timezone,
      threshold: establishments.approvalThresholdCents,
    })
    .from(establishments)
    .where(eq(establishments.id, s.establishmentId));

  const rows = await db
    .select({
      id: orders.id,
      shortCode: orders.shortCode,
      status: orders.status,
      createdAt: orders.createdAt,
      totalCents: orders.totalGrossCents,
      notes: orders.notes,
      tableLabel: diningTables.label,
      hasJob: sql<boolean>`exists (select 1 from ${outbox} where ${outbox.topic} = ${SUBMIT_ORDER_TOPIC} and ${outbox.payload}->>'orderId' = ${orders.id}::text)`,
    })
    .from(orders)
    .innerJoin(diningTables, eq(diningTables.id, orders.tableId))
    .where(
      and(
        eq(orders.organizationId, s.organizationId),
        eq(orders.establishmentId, s.establishmentId),
        or(gte(orders.createdAt, startOfLocalDay(now, est.timezone)), inArray(orders.status, ACTIVE)),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(300);

  const ids = rows.map((r) => r.id);
  const [items, events] = ids.length
    ? await Promise.all([
        db.select().from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(orderItems.orderId, orderItems.lineNo),
        db
          .select({ orderId: orderEvents.orderId, detail: orderEvents.detail })
          .from(orderEvents)
          .where(and(inArray(orderEvents.orderId, ids), inArray(orderEvents.toStatus, ["FAILED_RETRYING", "NEEDS_ATTENTION", "REJECTED"])))
          .orderBy(desc(orderEvents.createdAt)),
      ])
    : [[], []];

  const problemOf = new Map<string, string>();
  const ambiguousOf = new Set<string>();
  for (const e of events) {
    const detail = e.detail as { reason?: string; ambiguous?: boolean } | null;
    if (detail?.reason && !problemOf.has(e.orderId)) {
      problemOf.set(e.orderId, detail.reason);
      if (detail.ambiguous) ambiguousOf.add(e.orderId);
    }
  }

  // Posto de cada artigo, pela categoria na ementa MESVIO. Com um POS, o próprio POS distribui
  // pelas impressoras; aqui fica tudo como cozinha.
  const refs = [...new Set(items.map((i) => i.posProductRef))];
  const stationRows = refs.length
    ? await db
        .select({ ref: products.posProductRef, station: categories.station })
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(and(eq(products.establishmentId, s.establishmentId), inArray(products.posProductRef, refs)))
    : [];
  const stationOf = new Map(stationRows.map((r) => [r.ref, r.station]));

  const calls = await loadOpenCalls(db, s.establishmentId, now);
  return {
    establishmentName: est.name,
    manualAcceptance: est.manualAcceptance,
    approvalThresholdCents: est.threshold,
    calls,
    orders: rows.map((r) => ({
      id: r.id,
      shortCode: r.shortCode,
      tableLabel: r.tableLabel,
      status: r.status,
      awaitingApproval: r.status === "RECEIVED" && !r.hasJob,
      approvalReason:
        r.status === "RECEIVED" && !r.hasJob && !est.manualAcceptance && est.threshold !== null && r.totalCents > est.threshold
          ? `Valor acima de ${(est.threshold / 100).toFixed(0)} €: confirme que o pedido é verdadeiro`
          : undefined,
      createdAt: r.createdAt.toISOString(),
      totalCents: r.totalCents,
      notes: r.notes ?? undefined,
      problem: ["FAILED_RETRYING", "NEEDS_ATTENTION", "REJECTED"].includes(r.status) ? problemOf.get(r.id) : undefined,
      ambiguous: r.status === "NEEDS_ATTENTION" && ambiguousOf.has(r.id),
      highValue: r.totalCents >= HIGH_VALUE_CENTS,
      lines: items
        .filter((i) => i.orderId === r.id)
        .map((i) => ({ name: i.name, quantity: i.quantity, modifierNames: i.modifiers.map((m) => m.name), notes: i.notes ?? undefined, station: stationOf.get(i.posProductRef) ?? "kitchen" })),
    })),
  };
}

// ─────────────────────────── Ações sobre pedidos ───────────────────────────

export type StaffAction =
  | "approve" // aprovação manual → segue para o POS
  | "reject" // aprovação manual → recusado (não chega ao POS)
  | "confirm" // POS recebeu sem confirmar → staff confirma
  | "retry" // precisa de atenção → tentar enviar de novo
  | "handled" // precisa de atenção → staff lançou à mão no POS
  | "cancel"; // precisa de atenção → não avança

export const STAFF_ACTIONS: StaffAction[] = ["approve", "reject", "confirm", "retry", "handled", "cancel"];

export type ActionResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "CONFLICT"; message: string };

/** De que estado parte e para que estado vai cada ação. `null` = o worker decide (envio ao POS). */
const TRANSITIONS: Record<StaffAction, { from: OrderStatus; to: OrderStatus | null; needsApproval?: boolean }> = {
  approve: { from: "RECEIVED", to: null, needsApproval: true },
  reject: { from: "RECEIVED", to: "CANCELLED", needsApproval: true },
  confirm: { from: "SUBMITTED", to: "ACCEPTED" },
  retry: { from: "NEEDS_ATTENTION", to: "FAILED_RETRYING" },
  handled: { from: "NEEDS_ATTENTION", to: "ACCEPTED" },
  cancel: { from: "NEEDS_ATTENTION", to: "CANCELLED" },
};

export async function applyStaffAction(
  db: Db,
  s: StaffScope,
  orderId: string,
  action: StaffAction,
  deps: WorkerDeps = {},
): Promise<ActionResult> {
  const now = deps.now?.() ?? new Date();
  const rule = TRANSITIONS[action];
  const conflict: ActionResult = { ok: false, code: "CONFLICT", message: "Este pedido já mudou de estado. A lista foi atualizada." };

  const result = await withTenant(db, tenantOf(s), async (tx): Promise<ActionResult> => {
    const [o] = await tx
      .select({ id: orders.id, status: orders.status, sessionClosedAt: tableSessions.closedAt })
      .from(orders)
      .leftJoin(tableSessions, eq(tableSessions.id, orders.tableSessionId))
      .where(and(eq(orders.id, orderId), eq(orders.organizationId, s.organizationId), eq(orders.establishmentId, s.establishmentId)))
      .for("update", { of: orders });
    if (!o) return { ok: false, code: "NOT_FOUND", message: "Pedido não encontrado." };
    if (o.status !== rule.from) return conflict;
    // Mesa já fechada: nada deste pedido pode seguir para a cozinha (auditoria M1).
    if (o.sessionClosedAt && (action === "approve" || action === "retry")) {
      return { ok: false, code: "CONFLICT", message: "A mesa deste pedido já foi fechada. Não é possível enviá-lo para a cozinha." };
    }

    if (rule.needsApproval) {
      const [job] = await tx
        .select({ id: outbox.id })
        .from(outbox)
        .where(and(eq(outbox.topic, SUBMIT_ORDER_TOPIC), sql`${outbox.payload}->>'orderId' = ${orderId}`))
        .limit(1);
      if (job) return conflict; // já seguiu para o POS
    }

    if (rule.to) await tx.update(orders).set({ status: rule.to, updatedAt: now }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({
      organizationId: s.organizationId,
      orderId,
      fromStatus: o.status,
      toStatus: rule.to ?? o.status,
      source: "staff",
      detail: { action },
      createdAt: now,
    });
    if (action === "approve" || action === "retry") await enqueueSubmit(tx, s.organizationId, orderId, now);
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: `order.${action}`,
      entityType: "order",
      entityId: orderId,
      before: { status: o.status },
      after: { status: rule.to ?? o.status },
      createdAt: now,
    });
    return { ok: true };
  });

  if (result.ok && (action === "approve" || action === "retry")) {
    await dispatchWithinDeadline(db, orderId, { ...deps, label: "painel" });
  }
  return result;
}

// ─────────────────────────── Definições e esgotados ───────────────────────────

/** Limite opcional de aprovação para pedidos grandes (dono/gerente). null = desligado. */
export async function setApprovalThreshold(db: Db, s: StaffScope, cents: number | null): Promise<void> {
  await withTenant(db, tenantOf(s), async (tx) => {
    await tx
      .update(establishments)
      .set({ approvalThresholdCents: cents, updatedAt: new Date() })
      .where(and(eq(establishments.id, s.establishmentId), eq(establishments.organizationId, s.organizationId)));
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: "establishment.approval_threshold",
      entityType: "establishment",
      entityId: s.establishmentId,
      after: { approvalThresholdCents: cents },
    });
  });
}

/** Ligar/desligar pagamentos na mesa (dono/gerente). */
export async function setPaymentsEnabled(db: Db, s: StaffScope, enabled: boolean): Promise<void> {
  await withTenant(db, tenantOf(s), async (tx) => {
    await tx
      .update(establishments)
      .set({ paymentsEnabled: enabled, updatedAt: new Date() })
      .where(and(eq(establishments.id, s.establishmentId), eq(establishments.organizationId, s.organizationId)));
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: "establishment.payments_enabled",
      entityType: "establishment",
      entityId: s.establishmentId,
      after: { paymentsEnabled: enabled },
    });
  });
}

export interface EstablishmentBranding {
  brandColor: string | null;
  brandLogoUrl: string | null;
}

export async function getBranding(db: Db, s: StaffScope): Promise<EstablishmentBranding> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [e] = await tx
      .select({ brandColor: establishments.brandColor, brandLogoUrl: establishments.brandLogoUrl })
      .from(establishments)
      .where(eq(establishments.id, s.establishmentId));
    return e ?? { brandColor: null, brandLogoUrl: null };
  });
}

/** Cor e logótipo da ementa (dono/gerente). Valores já validados pela rota (cor AA, URL https). */
export async function setBranding(db: Db, s: StaffScope, branding: EstablishmentBranding): Promise<void> {
  await withTenant(db, tenantOf(s), async (tx) => {
    await tx
      .update(establishments)
      .set({ ...branding, updatedAt: new Date() })
      .where(and(eq(establishments.id, s.establishmentId), eq(establishments.organizationId, s.organizationId)));
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: "establishment.branding",
      entityType: "establishment",
      entityId: s.establishmentId,
      after: { ...branding },
    });
  });
}

export async function getPaymentsEnabled(db: Db, s: StaffScope): Promise<boolean> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [e] = await tx.select({ v: establishments.paymentsEnabled }).from(establishments).where(eq(establishments.id, s.establishmentId));
    return e?.v ?? false;
  });
}

export async function setManualAcceptance(db: Db, s: StaffScope, enabled: boolean): Promise<void> {
  await withTenant(db, tenantOf(s), async (tx) => {
    await tx
      .update(establishments)
      .set({ manualAcceptance: enabled, updatedAt: new Date() })
      .where(and(eq(establishments.id, s.establishmentId), eq(establishments.organizationId, s.organizationId)));
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: "establishment.manual_acceptance",
      entityType: "establishment",
      entityId: s.establishmentId,
      after: { manualAcceptance: enabled },
    });
  });
}

export interface StaffCatalogSection {
  section: string;
  categories: {
    ref: string;
    name: string;
    products: { ref: string; name: string; priceCents: number; posAvailable: boolean; locallyUnavailable: boolean }[];
  }[];
}

export async function getStaffCatalog(db: Db, s: StaffScope, resolvePos: PosResolver = resolvePosAdapter): Promise<StaffCatalogSection[]> {
  const { provider, unavailable } = await withTenant(db, tenantOf(s), async (tx) => {
    const [integration] = await tx
      .select({ provider: posIntegrations.provider })
      .from(posIntegrations)
      .where(eq(posIntegrations.establishmentId, s.establishmentId));
    return { provider: integration.provider, unavailable: await listLocallyUnavailable(tx, s.establishmentId) };
  });
  const catalog = await resolvePos(provider, s.establishmentId).fetchCatalog();
  const sections: StaffCatalogSection[] = [];
  for (const c of [...catalog.categories].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const name = c.section ?? "Ementa";
    let section = sections.find((x) => x.section === name);
    if (!section) sections.push((section = { section: name, categories: [] }));
    section.categories.push({
      ref: c.posCategoryRef,
      name: c.name,
      products: catalog.products
        .filter((p) => p.posCategoryRef === c.posCategoryRef)
        .map((p) => ({
          ref: p.posProductRef,
          name: p.name,
          priceCents: p.priceCents,
          posAvailable: p.available,
          locallyUnavailable: unavailable.has(p.posProductRef),
        })),
    });
  }
  return sections;
}

export async function setProductSoldOut(db: Db, s: StaffScope, posProductRef: string, soldOut: boolean): Promise<void> {
  await withTenant(db, tenantOf(s), async (tx) => {
    await setLocallyUnavailable(tx, s, posProductRef, soldOut);
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
    action: soldOut ? "product.sold_out" : "product.available",
      entityType: "product",
      entityId: posProductRef,
    });
  });
}
