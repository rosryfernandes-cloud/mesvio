import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import webpush from "web-push";
import { formatEur } from "@/lib/money";
import { getDb, type Db } from "@/server/db/client";
import { diningTables, establishments, platformAdmins, pushSubscriptions } from "@/server/db/schema";
import { resolveTableToken, withTenant } from "@/server/db/tenant";
import { keepAlive } from "@/server/runtime/keep-alive";
import type { StaffContext } from "@/server/staff/context";

/**
 * Notificações no telemóvel da equipa (web push), mesmo com o ecrã bloqueado: pediu a conta,
 * chamou o empregado, pagou no telemóvel, pedido novo. Vão para o responsável da mesa (mesas por
 * empregado) ou, se a mesa não tiver responsável, para toda a equipa que as ligou. Nunca atrasam
 * o cliente: correm depois da resposta e um erro de envio só fica no registo.
 */
type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

export type TableEvent =
  | { kind: "bill"; detail: string | null }
  | { kind: "waiter"; detail: string | null }
  | { kind: "paid"; amountCents: number }
  | { kind: "order"; shortCode: string; totalCents: number };

export interface PushMessage {
  title: string;
  body: string;
  /** Mesma etiqueta = substitui a notificação anterior da mesma mesa e tipo (não enche o ecrã). */
  tag: string;
  url: string;
}

const BILL: Record<string, string> = { card: "cartão", cash: "dinheiro" };
const WAITER: Record<string, string> = { order: "para pedir", napkins: "guardanapos", clear: "levantar a mesa", other: "outro motivo" };

export function messageFor(tableLabel: string, tableId: string, e: TableEvent): PushMessage {
  const base = { title: tableLabel, url: "/painel" };
  switch (e.kind) {
    case "bill":
      return { ...base, tag: `bill-${tableId}`, body: `Pediu a conta${e.detail && BILL[e.detail] ? ` (${BILL[e.detail]})` : ""}` };
    case "waiter":
      return { ...base, tag: `waiter-${tableId}`, body: `Chamou o empregado${e.detail && WAITER[e.detail] ? ` (${WAITER[e.detail]})` : ""}` };
    case "paid":
      return { ...base, tag: `paid-${tableId}`, body: `Pagou no telemóvel: ${formatEur(e.amountCents)}` };
    case "order":
      return { ...base, tag: `order-${tableId}-${e.shortCode}`, body: `Pedido novo #${e.shortCode} · ${formatEur(e.totalCents)}` };
  }
}

// ─────────────────────────── Aparelhos ───────────────────────────

export const subscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(8).max(200) }),
});

/** Este aparelho passa a receber notificações (o mesmo aparelho não fica duas vezes). */
export async function saveSubscription(db: Db, s: Scope, raw: unknown): Promise<boolean> {
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) return false;
  const { endpoint, keys } = parsed.data;
  return withTenant(db, tenantOf(s), async (tx) => {
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    await tx.insert(pushSubscriptions).values({
      organizationId: s.organizationId,
      establishmentId: s.establishmentId,
      userId: s.userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
    return true;
  });
}

export async function removeSubscription(db: Db, s: Scope, endpoint: string): Promise<void> {
  await withTenant(db, tenantOf(s), (tx) =>
    tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, s.userId))),
  );
}

// ─────────────────────────── Envio ───────────────────────────

export type PushSender = (sub: { endpoint: string; p256dh: string; auth: string }, payload: string) => Promise<{ statusCode: number }>;

/** Chaves VAPID das variáveis de ambiente; sem elas as notificações ficam desligadas. */
function vapidSender(): PushSender | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT || "https://mesvio.vercel.app";
  return (sub, payload) =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
      vapidDetails: { subject, publicKey, privateKey },
      TTL: 60 * 30,
      urgency: "high",
    });
}

/** Envia a mensagem a uma lista de aparelhos; apaga os que já não existem (404/410). */
async function deliver(db: Db, organizationId: string, subs: (typeof pushSubscriptions.$inferSelect)[], message: PushMessage, send: PushSender): Promise<number> {
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await send(sub, JSON.stringify(message));
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(sub.id);
        else console.error("[notificações] envio falhou", status ?? err);
      }
    }),
  );
  if (gone.length) {
    await withTenant(db, { organizationId }, (tx) => tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone)));
  }
  return sent;
}

/**
 * Notifica um acontecimento numa mesa: ao responsável (mesas por empregado ligadas e mesa com
 * responsável), senão a todos os aparelhos do restaurante. Devolve quantas notificações saíram.
 */
export async function notifyTableEvent(
  db: Db,
  t: { organizationId: string; establishmentId: string; tableId: string },
  event: TableEvent,
  send: PushSender | null = vapidSender(),
): Promise<number> {
  if (!send) return 0;
  const target = await withTenant(db, { organizationId: t.organizationId }, async (tx) => {
    const [table] = await tx
      .select({ label: diningTables.label, assigned: diningTables.assignedUserId, assignments: establishments.tableAssignmentsEnabled })
      .from(diningTables)
      .innerJoin(establishments, eq(establishments.id, diningTables.establishmentId))
      .where(eq(diningTables.id, t.tableId));
    if (!table) return null;
    const owner = table.assignments ? table.assigned : null;
    const subs = await tx
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.establishmentId, t.establishmentId), ...(owner ? [eq(pushSubscriptions.userId, owner)] : [])));
    return { label: table.label, subs };
  });
  if (!target || target.subs.length === 0) return 0;
  return deliver(db, t.organizationId, target.subs, messageFor(target.label, t.tableId, event), send);
}

/** Notificação de teste para os aparelhos da própria pessoa ("Enviar teste" no painel). */
export async function notifyMe(db: Db, s: Scope, send: PushSender | null = vapidSender()): Promise<number> {
  if (!send) return 0;
  const subs = await withTenant(db, tenantOf(s), (tx) =>
    tx.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, s.userId), eq(pushSubscriptions.establishmentId, s.establishmentId))),
  );
  return deliver(db, s.organizationId, subs, { title: "MESVIO", body: "As notificações estão a funcionar. ✓", tag: "teste", url: "/painel" }, send);
}

/**
 * Avisos para a equipa MESVIO (ex.: novo pedido de demonstração): vão para os aparelhos em que
 * os administradores do painel central ligaram as notificações no painel. Ligação de sistema.
 */
export async function notifyPlatformAdmins(systemDb: Db, message: PushMessage, send: PushSender | null = vapidSender()): Promise<number> {
  if (!send) return 0;
  const admins = await systemDb.select({ userId: platformAdmins.userId }).from(platformAdmins);
  if (admins.length === 0) return 0;
  const subs = await systemDb.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, admins.map((a) => a.userId)));
  // O mesmo aparelho pode estar ligado em vários restaurantes: uma notificação por aparelho.
  const unique = [...new Map(subs.map((s) => [s.endpoint, s])).values()];
  let sent = 0;
  for (const [org, list] of Map.groupBy(unique, (s) => s.organizationId)) sent += await deliver(systemDb, org, list, message, send);
  return sent;
}

/** Envia uma notificação qualquer depois da resposta (sem chaves VAPID não faz nada). */
export function queuePush(job: (db: Db) => Promise<unknown>): void {
  if (!vapidSender()) return;
  keepAlive((async () => job(await getDb()))().catch((err) => console.error("[notificações] falhou", err)));
}

/**
 * Para usar nas rotas e nos pagamentos: envia depois da resposta, sem nunca falhar quem chamou.
 * Sem chaves VAPID (testes, desenvolvimento sem notificações) não faz nada.
 */
export function queueTableEvent(t: { organizationId: string; establishmentId: string; tableId: string }, event: TableEvent): void {
  if (!vapidSender()) return;
  keepAlive(
    (async () => notifyTableEvent(await getDb(), t, event))().catch((err) => console.error("[notificações] falhou", err)),
  );
}

/** O mesmo, a partir do token do QR da mesa (rotas do cliente). */
export function queueTableEventByToken(token: string, event: TableEvent): void {
  if (!vapidSender()) return;
  keepAlive(
    (async () => {
      const db = await getDb();
      const t = await resolveTableToken(db, token);
      if (t) await notifyTableEvent(db, t, event);
    })().catch((err) => console.error("[notificações] falhou", err)),
  );
}
