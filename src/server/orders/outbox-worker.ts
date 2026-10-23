import "server-only";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { diningTables, orderEvents, orderItems, orders, outbox, posIntegrations } from "@/server/db/schema";
import { resolvePosAdapter, type PosResolver } from "@/server/pos/registry";
import type { PosOrderResult } from "@/server/pos/types";
import { pruneRateLimits } from "@/server/security/rate-limit";
import { activePaymentProvider } from "@/server/payments/provider";
import { reconcilePendingPayments } from "@/server/payments/table-payments";
import type { OrderStatus } from "./order-view";
import { SUBMIT_ORDER_TOPIC } from "./outbox";

/**
 * Fila de envio ao POS — transactional outbox em Postgres (docs/07 D15).
 *
 * Cada pedido gera uma linha `outbox` na mesma transação. O worker "reclama" linhas com
 * `FOR UPDATE SKIP LOCKED` (vários workers nunca pegam na mesma) e dá-lhes um prazo (lease):
 * se o processo morrer a meio, a linha volta a ficar disponível quando o prazo expirar.
 * O POS recebe sempre o nosso orderId como referência externa. Um reenvio só é automático quando
 * é seguro: falha antes da entrega, ou POS que declara deduplicar pela referência externa.
 * Resultados ambíguos num POS sem essa garantia vão para o staff verificar (auditoria F1).
 */
export { SUBMIT_ORDER_TOPIC };

export interface WorkerDeps {
  resolvePos?: PosResolver;
  now?: () => Date;
  /** Tentativas até desistir e alertar o staff. */
  maxAttempts?: number;
  /** Espera antes da tentativa n+1 (ms). */
  backoffMs?: (attempt: number) => number;
  /** Tempo máximo à espera do POS numa tentativa. */
  posTimeoutMs?: number;
}

const LEASE_MS = 2 * 60_000;
const FINAL: OrderStatus[] = ["SUBMITTED", "ACCEPTED", "REJECTED", "NEEDS_ATTENTION", "IN_PREPARATION", "SERVED", "CANCELLED"];

/** 2 s, 4 s, 8 s … até 1 min, com ±20% de aleatoriedade para não sincronizar reenvios. 8 tentativas ≈ 3 min. */
export function defaultBackoffMs(attempt: number): number {
  const base = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

const defaults = (d: WorkerDeps) => ({
  resolvePos: d.resolvePos ?? resolvePosAdapter,
  now: d.now ?? (() => new Date()),
  maxAttempts: d.maxAttempts ?? 8,
  backoffMs: d.backoffMs ?? defaultBackoffMs,
  posTimeoutMs: d.posTimeoutMs ?? 20_000,
});

type Job = typeof outbox.$inferSelect;

/** Reclama até `limit` tarefas prontas (opcionalmente só as de um pedido). */
async function claimJobs(db: Db, now: Date, limit: number, orderId?: string): Promise<Job[]> {
  return db.transaction(async (tx) => {
    const ready = await tx
      .select({ id: outbox.id })
      .from(outbox)
      .where(
        and(
          inArray(outbox.status, ["PENDING", "DISPATCHED"]), // DISPATCHED com lease expirado = worker que morreu
          lte(outbox.availableAt, now),
          eq(outbox.topic, SUBMIT_ORDER_TOPIC),
          orderId ? sql`${outbox.payload}->>'orderId' = ${orderId}` : undefined,
        ),
      )
      .orderBy(asc(outbox.availableAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (ready.length === 0) return [];
    return tx
      .update(outbox)
      .set({ status: "DISPATCHED", attempts: sql`${outbox.attempts} + 1`, availableAt: new Date(now.getTime() + LEASE_MS) })
      .where(inArray(outbox.id, ready.map((r) => r.id)))
      .returning();
  });
}

/**
 * Muda o estado SÓ se o pedido ainda estiver em `from` (compare-and-set). Se entretanto mudou
 * (ex.: o staff fechou a mesa e cancelou-o), não pisa essa decisão. Devolve se mudou.
 */
async function transition(db: Db, orderId: string, organizationId: string, from: OrderStatus, to: OrderStatus, source: "system" | "pos", now: Date, detail?: unknown): Promise<boolean> {
  if (from === to) return true;
  return db.transaction(async (tx) => {
    const changed = await tx
      .update(orders)
      .set({ status: to, updatedAt: now })
      .where(and(eq(orders.id, orderId), eq(orders.status, from)))
      .returning({ id: orders.id });
    if (changed.length === 0) return false;
    await tx.insert(orderEvents).values({ organizationId, orderId, fromStatus: from, toStatus: to, source, detail: detail ?? null, createdAt: now });
    return true;
  });
}

/** Chama o POS com prazo; ao fim do prazo aborta o pedido HTTP e devolve um resultado ambíguo. */
async function submitWithTimeout(call: (signal: AbortSignal) => Promise<PosOrderResult>, ms: number): Promise<PosOrderResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PosOrderResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ outcome: "unknown", reason: `O POS não respondeu em ${ms / 1000} s` });
    }, ms);
  });
  try {
    return await Promise.race([call(controller.signal), timeout]);
  } catch (err) {
    // Exceção do adaptador sem classificação: não sabemos se o POS recebeu.
    return { outcome: "unknown", reason: err instanceof Error ? err.message : "Erro desconhecido" };
  } finally {
    clearTimeout(timer);
  }
}

async function processJob(db: Db, job: Job, d: ReturnType<typeof defaults>): Promise<void> {
  const now = d.now();
  const orderId = (job.payload as { orderId: string }).orderId;
  const [o] = await db
    .select({
      id: orders.id,
      organizationId: orders.organizationId,
      establishmentId: orders.establishmentId,
      status: orders.status,
      notes: orders.notes,
      posTableRef: diningTables.posTableRef,
      provider: posIntegrations.provider,
    })
    .from(orders)
    .innerJoin(diningTables, eq(diningTables.id, orders.tableId))
    .innerJoin(posIntegrations, eq(posIntegrations.establishmentId, orders.establishmentId))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!o || FINAL.includes(o.status)) {
    await db.update(outbox).set({ status: "DONE" }).where(eq(outbox.id, job.id));
    return;
  }

  await db.update(orders).set({ submitAttempts: job.attempts, updatedAt: now }).where(eq(orders.id, o.id));
  // Se o pedido mudou entretanto (cancelado ao fechar a mesa), não se envia.
  if (!(await transition(db, o.id, o.organizationId, o.status, "SUBMITTING", "system", now, { attempt: job.attempts }))) {
    await db.update(outbox).set({ status: "DONE" }).where(eq(outbox.id, job.id));
    return;
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id)).orderBy(asc(orderItems.lineNo));
  const pos = d.resolvePos(o.provider, o.establishmentId);
  let result = await submitWithTimeout(
    (signal) =>
      pos.submitOrder(
        {
          externalOrderId: o.id,
          posTableRef: o.posTableRef!,
          lines: items.map((i) => ({
            posProductRef: i.posProductRef,
            quantity: i.quantity,
            unitPriceCents: i.unitPriceCents,
            modifiers: i.modifiers.map(({ posModifierRef }) => ({ posModifierRef })),
            notes: i.notes ?? undefined,
          })),
          notes: o.notes ?? undefined,
        },
        { signal },
      ),
    d.posTimeoutMs,
  );
  // Ambíguo + POS que deduplica pela referência externa → reenviar é seguro, trata-se como falha normal.
  if (result.outcome === "unknown" && pos.capabilities.externalIdempotencyKey) {
    result = { outcome: "retryable_error", reason: result.reason };
  }

  const done = d.now();
  switch (result.outcome) {
    case "accepted":
    case "submitted":
      await db.update(orders).set({ posOrderRef: result.posOrderRef ?? null }).where(eq(orders.id, o.id));
      if (!(await transition(db, o.id, o.organizationId, "SUBMITTING", result.outcome === "accepted" ? "ACCEPTED" : "SUBMITTED", "pos", done, result))) {
        // Cancelado enquanto o POS respondia (ex.: mesa fechada): o pedido ESTÁ no POS e tem de ser anulado lá.
        await db.insert(orderEvents).values({
          organizationId: o.organizationId,
          orderId: o.id,
          toStatus: "CANCELLED",
          source: "pos",
          detail: { posAcceptedAfterCancel: true, posOrderRef: result.posOrderRef ?? null, reason: "Anular no POS: pedido cancelado na app mas aceite pelo POS" },
          createdAt: done,
        });
        console.error(`[outbox] pedido ${o.id} cancelado na app mas aceite pelo POS (${result.posOrderRef}); anular no POS`);
      }
      await db.update(outbox).set({ status: "DONE", lastError: null }).where(eq(outbox.id, job.id));
      return;
    case "rejected":
      await transition(db, o.id, o.organizationId, "SUBMITTING", "REJECTED", "pos", done, result);
      await db.update(outbox).set({ status: "DONE", lastError: result.reason }).where(eq(outbox.id, job.id));
      return;
    case "unknown":
      // Não sabemos se o POS recebeu e ele não garante deduplicação: reenviar podia duplicar na cozinha.
      await transition(db, o.id, o.organizationId, "SUBMITTING", "NEEDS_ATTENTION", "system", done, { ...result, ambiguous: true });
      await db.update(outbox).set({ status: "DEAD", lastError: result.reason }).where(eq(outbox.id, job.id));
      console.error(`[outbox] pedido ${o.id}: resultado ambíguo do POS, sem reenvio automático: ${result.reason}`);
      return;
    case "retryable_error": {
      if (job.attempts >= d.maxAttempts) {
        // Desistir: o staff vê o pedido como "precisa de atenção" e trata-o à mão.
        await transition(db, o.id, o.organizationId, "SUBMITTING", "NEEDS_ATTENTION", "system", done, result);
        await db.update(outbox).set({ status: "DEAD", lastError: result.reason }).where(eq(outbox.id, job.id));
        console.error(`[outbox] pedido ${o.id} sem resposta do POS após ${job.attempts} tentativas: ${result.reason}`);
        return;
      }
      await transition(db, o.id, o.organizationId, "SUBMITTING", "FAILED_RETRYING", "system", done, result);
      await db
        .update(outbox)
        .set({ status: "PENDING", lastError: result.reason, availableAt: new Date(done.getTime() + d.backoffMs(job.attempts)) })
        .where(eq(outbox.id, job.id));
      return;
    }
  }
}

/** Tenta já o envio de um pedido acabado de criar (se outro worker não o tiver apanhado). */
export async function dispatchOrderNow(db: Db, orderId: string, deps: WorkerDeps = {}): Promise<void> {
  const d = defaults(deps);
  for (const job of await claimJobs(db, d.now(), 1, orderId)) await processJob(db, job, d);
}

/** Processa um lote de tarefas prontas. Devolve quantas processou. */
export async function runOutboxOnce(db: Db, deps: WorkerDeps = {}, batchSize = 20): Promise<number> {
  const d = defaults(deps);
  const jobs = await claimJobs(db, d.now(), batchSize);
  for (const job of jobs) {
    try {
      await processJob(db, job, d);
    } catch (err) {
      // A linha fica DISPATCHED e volta à fila quando o lease expirar.
      console.error(`[outbox] falha a processar ${job.id}`, err);
    }
  }
  return jobs.length;
}

/** Ciclo do worker dentro do servidor Node (instrumentation.ts). Seguro contra arranques duplicados. */
export function startOutboxPoller(getDb: () => Promise<Db>, intervalMs = 2_000): void {
  const g = globalThis as typeof globalThis & { __outboxPoller?: boolean };
  if (g.__outboxPoller) return;
  g.__outboxPoller = true;
  let running = false;
  let ticks = 0;
  let lastErrorLog = 0;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const db = await getDb();
      while ((await runOutboxOnce(db)) > 0) {
        // esvaziar o que estiver pronto antes do próximo intervalo
      }
      ticks++;
      // Pagamentos pendentes: confirmar junto do fornecedor sem depender do telemóvel do cliente (~30 s).
      if (ticks % 15 === 0) {
        const provider = activePaymentProvider();
        if (provider) await reconcilePendingPayments(db, provider);
      }
      if (ticks % 1800 === 0) await pruneRateLimits(db); // ~1 h
    } catch (err) {
      // BD em baixo: continuar a tentar a cada ciclo, mas registar no máximo uma vez por minuto.
      if (Date.now() - lastErrorLog > 60_000) {
        lastErrorLog = Date.now();
        console.error("[outbox] ciclo falhou", err);
      }
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.();
}
