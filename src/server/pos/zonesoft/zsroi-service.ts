import "server-only";
import { and, desc, eq, gte, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { auditLogs, categories, modifierGroups, modifiers, orderEvents, orders, posIntegrations, productModifierGroups, products } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import { guessStation } from "@/lib/station";
import { open, seal } from "@/server/security/secret-box";
import type { PosCatalog } from "../types";
import { issueToken, sameSecret, signRequest, zoneSoftCredentialsSchema, type ZoneSoftCredentials, type ZsroiTokenClaims } from "./zsroi-auth";
import { parseZsroiMenu } from "./zsroi-menu";

/**
 * Lógica dos endpoints que a ZoneSoft (ZSROI) chama na MESVIO: login, ementa e estado dos pedidos.
 * As rotas em `src/app/api/pos/zonesoft/*` só tratam de HTTP.
 */

export function readCredentials(ciphertext: string | null): ZoneSoftCredentials | null {
  if (!ciphertext) return null;
  try {
    const parsed = zoneSoftCredentialsSchema.safeParse(JSON.parse(open(ciphertext)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ───────────── Login ─────────────

const loginSchema = z.object({ app_store_username: z.string().min(1).max(512), app_store_secret: z.string().min(1).max(512) });

export type LoginResult = { ok: true; accessToken: string; expiresIn: number } | { ok: false; status: 400 | 401 };

export async function zsroiLogin(db: Db, raw: unknown, now = new Date()): Promise<LoginResult> {
  const body = loginSchema.safeParse(raw);
  if (!body.success) return { ok: false, status: 400 };
  const rows = await db
    .select({ establishmentId: posIntegrations.establishmentId, organizationId: posIntegrations.organizationId, ciphertext: posIntegrations.credentialsCiphertext })
    .from(posIntegrations)
    .where(eq(posIntegrations.provider, "zonesoft"));
  let match: ZsroiTokenClaims | null = null;
  for (const r of rows) {
    const c = readCredentials(r.ciphertext);
    // Compara sempre as duas partes (sem atalhos), para o tempo de resposta não revelar nada.
    const keyOk = c ? sameSecret(c.appKey, body.data.app_store_username) : false;
    const secretOk = c ? sameSecret(c.appSecret, body.data.app_store_secret) : false;
    if (keyOk && secretOk && !match) match = { establishmentId: r.establishmentId, organizationId: r.organizationId };
  }
  if (!match) return { ok: false, status: 401 };
  const t = issueToken(match, now);
  return { ok: true, accessToken: t.accessToken, expiresIn: t.expiresIn };
}

// ───────────── Ementa ─────────────

export type MenuResult = { ok: true; categories: number; products: number; hidden: number } | { ok: false; status: 400 | 404; error: string };

export async function zsroiReceiveMenu(db: Db, claims: ZsroiTokenClaims, raw: unknown, now = new Date()): Promise<MenuResult> {
  const parsed = parseZsroiMenu(raw, now);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return withTenant(db, { organizationId: claims.organizationId }, async (tx) => {
    const [integration] = await tx
      .select({ provider: posIntegrations.provider })
      .from(posIntegrations)
      .where(eq(posIntegrations.establishmentId, claims.establishmentId));
    // O restaurante pode ter mudado de POS depois de o token ser emitido.
    if (integration?.provider !== "zonesoft") return { ok: false, status: 404, error: "Integration not found" };
    const result = await syncCatalog(tx, claims.organizationId, claims.establishmentId, parsed.catalog, now);
    await tx
      .update(posIntegrations)
      .set({ lastCatalogSyncAt: now, status: "healthy", lastError: null })
      .where(eq(posIntegrations.establishmentId, claims.establishmentId));
    await tx.insert(auditLogs).values({
      organizationId: claims.organizationId,
      actorType: "pos",
      actorId: null,
      action: "pos.zonesoft.menu_sync",
      entityType: "establishment",
      entityId: claims.establishmentId,
      after: result,
    });
    return { ok: true, ...result };
  });
}

/**
 * Atualiza a ementa do restaurante com a do POS, mantendo as referências da ZoneSoft:
 * fotos, traduções e esgotados continuam ligados aos mesmos pratos. O que deixou de vir no menu
 * fica escondido (categorias) ou indisponível (pratos), sem apagar o histórico dos pedidos.
 */
export async function syncCatalog(tx: Db, organizationId: string, establishmentId: string, catalog: PosCatalog, now: Date) {
  const existingCats = await tx
    .select({ id: categories.id, ref: categories.posCategoryRef })
    .from(categories)
    .where(eq(categories.establishmentId, establishmentId));
  const catByRef = new Map(existingCats.filter((c) => c.ref).map((c) => [c.ref!, c.id]));
  const catId = new Map<string, string>();
  for (const [i, c] of catalog.categories.entries()) {
    const found = catByRef.get(c.posCategoryRef);
    if (found) {
      await tx.update(categories).set({ name: c.name, section: c.section ?? null, sortOrder: i, visible: true }).where(eq(categories.id, found));
      catId.set(c.posCategoryRef, found);
    } else {
      const [row] = await tx
        .insert(categories)
        .values({ organizationId, establishmentId, posCategoryRef: c.posCategoryRef, name: c.name, section: c.section ?? null, station: guessStation(c.name, c.section), sortOrder: i })
        .returning({ id: categories.id });
      catId.set(c.posCategoryRef, row.id);
    }
  }
  const keptCats = [...catId.values()];
  await tx
    .update(categories)
    .set({ visible: false })
    .where(keptCats.length ? and(eq(categories.establishmentId, establishmentId), notInArray(categories.id, keptCats)) : eq(categories.establishmentId, establishmentId));

  const existingProds = await tx
    .select({ id: products.id, ref: products.posProductRef })
    .from(products)
    .where(eq(products.establishmentId, establishmentId));
  const prodByRef = new Map(existingProds.map((p) => [p.ref, p.id]));
  const keptProds: string[] = [];
  let count = 0;
  for (const [i, p] of catalog.products.entries()) {
    const categoryId = catId.get(p.posCategoryRef);
    if (!categoryId) continue;
    const values = {
      categoryId,
      name: p.name,
      description: p.description ?? null,
      imageUrl: p.imageUrl ?? null,
      priceCents: p.priceCents,
      vatRateBps: p.vatRateBps,
      posAvailable: p.available,
      sortOrder: i,
      syncedAt: now,
    };
    let productId = prodByRef.get(p.posProductRef);
    if (productId) {
      await tx.update(products).set(values).where(eq(products.id, productId));
      // Opções: um grupo por prato (como na importação). Substituem-se as antigas por inteiro.
      const links = await tx.select({ groupId: productModifierGroups.groupId }).from(productModifierGroups).where(eq(productModifierGroups.productId, productId));
      if (links.length) {
        const groupIds = links.map((l) => l.groupId);
        await tx.delete(productModifierGroups).where(eq(productModifierGroups.productId, productId));
        await tx.delete(modifiers).where(inArray(modifiers.groupId, groupIds));
        await tx.delete(modifierGroups).where(inArray(modifierGroups.id, groupIds));
      }
    } else {
      const [row] = await tx
        .insert(products)
        .values({ organizationId, establishmentId, posProductRef: p.posProductRef, allergens: [], tags: [], ...values })
        .returning({ id: products.id });
      productId = row.id;
    }
    keptProds.push(productId);
    count++;
    for (const [n, g] of p.modifierGroups.entries()) {
      const [gr] = await tx
        .insert(modifierGroups)
        .values({ organizationId, establishmentId, posGroupRef: g.posGroupRef, name: g.name, kind: g.kind, minSelect: g.minSelect, maxSelect: g.maxSelect })
        .returning({ id: modifierGroups.id });
      for (const [k, m] of g.modifiers.entries()) {
        await tx.insert(modifiers).values({ organizationId, groupId: gr.id, posModifierRef: m.posModifierRef, name: m.name, priceDeltaCents: m.priceDeltaCents, available: m.available, sortOrder: k });
      }
      await tx.insert(productModifierGroups).values({ productId, groupId: gr.id, sortOrder: n });
    }
  }
  const hidden = keptProds.length
    ? await tx
        .update(products)
        .set({ posAvailable: false, syncedAt: now })
        .where(and(eq(products.establishmentId, establishmentId), notInArray(products.id, keptProds), eq(products.posAvailable, true)))
        .returning({ id: products.id })
    : [];
  return { categories: catId.size, products: count, hidden: hidden.length };
}

// ───────────── Estado dos pedidos ─────────────

const statusSchema = z.object({
  order_id: z.union([z.string(), z.number()]).transform(String),
  status: z.string().trim().toLowerCase(),
  estimated_time: z.union([z.number(), z.string()]).optional(),
  reason: z.string().optional(),
});

type OrderStatus = (typeof orders.$inferSelect)["status"];

/** Estados da ZoneSoft → os nossos. "remind" (lembrete) não muda nada. */
const MAP: Record<string, OrderStatus | null> = {
  accept: "ACCEPTED",
  accepted: "ACCEPTED",
  decline: "REJECTED",
  declined: "REJECTED",
  ready: "SERVED",
  delivered: "SERVED",
  pickedup: "SERVED",
  remind: null,
};

/** Só se avança: um "accept" atrasado não pode desfazer um "ready". */
const RANK: Partial<Record<OrderStatus, number>> = {
  RECEIVED: 0,
  SUBMITTING: 1,
  SUBMITTED: 2,
  FAILED_RETRYING: 2,
  NEEDS_ATTENTION: 2,
  ACCEPTED: 3,
  IN_PREPARATION: 4,
  SERVED: 5,
};

export type StatusResult = { ok: true; changed: boolean } | { ok: false; status: 400 | 404; code: string; message: string };

const UUID = z.uuid();

export async function zsroiOrderStatus(db: Db, claims: ZsroiTokenClaims, raw: unknown): Promise<StatusResult> {
  const body = statusSchema.safeParse(raw);
  if (!body.success || !(body.data.status in MAP)) return { ok: false, status: 400, code: "bad_request", message: "Invalid status" };
  const next = MAP[body.data.status];
  // O order_id que enviamos à ZoneSoft é o id do nosso pedido.
  if (!UUID.safeParse(body.data.order_id).success) return { ok: false, status: 404, code: "resource_not_found", message: "Order not found" };
  return withTenant(db, { organizationId: claims.organizationId }, async (tx) => {
    const [order] = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, body.data.order_id), eq(orders.establishmentId, claims.establishmentId)));
    if (!order) return { ok: false, status: 404, code: "resource_not_found", message: "Order not found" };
    if (!next || order.status === next) return { ok: true, changed: false };
    const terminal = order.status === "REJECTED" || order.status === "CANCELLED";
    const forward = next === "REJECTED" ? (RANK[order.status] ?? 99) <= RANK.SUBMITTED! : (RANK[next] ?? 0) > (RANK[order.status] ?? 99);
    if (terminal || !forward) return { ok: true, changed: false };
    await tx.update(orders).set({ status: next }).where(eq(orders.id, order.id));
    await tx.insert(orderEvents).values({
      organizationId: claims.organizationId,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: next,
      source: "pos",
      detail: { provider: "zonesoft", status: body.data.status, estimatedTime: body.data.estimated_time ?? null, reason: body.data.reason ?? null },
    });
    return { ok: true, changed: true };
  });
}

// ───────────── Ligar um restaurante (Central) ─────────────

export type LinkResult = { ok: true } | { ok: false; code: "INVALID" | "NOT_FOUND"; message: string };

/** Guarda as credenciais ZoneSoft do restaurante (cifradas) e passa-o para o POS ZoneSoft. */
export async function linkZoneSoft(db: Db, adminUserId: string, establishmentId: string, raw: unknown): Promise<LinkResult> {
  const parsed = zoneSoftCredentialsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID", message: "Preencha o serial, o ID da loja, o APP-KEY e o APP-SECRET do cliente." };
  const [integration] = await db
    .select({ organizationId: posIntegrations.organizationId, provider: posIntegrations.provider })
    .from(posIntegrations)
    .where(eq(posIntegrations.establishmentId, establishmentId));
  if (!integration) return { ok: false, code: "NOT_FOUND", message: "Restaurante não encontrado." };
  await db.transaction(async (tx) => {
    await tx
      .update(posIntegrations)
      .set({ provider: "zonesoft", status: "not_configured", credentialsCiphertext: seal(JSON.stringify(parsed.data)), credentialsKeyId: "platform-v1" })
      .where(eq(posIntegrations.establishmentId, establishmentId));
    await tx.insert(auditLogs).values({
      organizationId: integration.organizationId,
      actorType: "admin",
      actorId: adminUserId,
      action: "platform.link_zonesoft",
      entityType: "establishment",
      entityId: establishmentId,
      // Nunca os segredos: só o que identifica a loja.
      after: { from: integration.provider, serial: parsed.data.serial, storeId: parsed.data.storeId },
    });
  });
  return { ok: true };
}

// ───────────── Testes com a conta demo (Central) ─────────────

export const ZSROI_TEST_PING_URL = "https://zsroi.zonesoft.org/v1.0/testintegration/ping";

export type PingResult = { ok: true; status: number; detail: string } | { ok: false; code: "NOT_FOUND" | "NO_CREDENTIALS" | "NETWORK"; message: string; status?: number; detail?: string };

/**
 * "Acorda" o POS da conta demo da ZoneSoft: o manual (example_testIntegration) pede um PING antes de
 * enviar pedidos de teste; sem ele, a ZSROI recusa com "order_rejected_pos_ping_failed".
 */
export async function pingZoneSoftDemo(
  db: Db,
  establishmentId: string,
  { fetchImpl = fetch, url = ZSROI_TEST_PING_URL }: { fetchImpl?: typeof fetch; url?: string } = {},
): Promise<PingResult> {
  const [row] = await db
    .select({ provider: posIntegrations.provider, ciphertext: posIntegrations.credentialsCiphertext })
    .from(posIntegrations)
    .where(eq(posIntegrations.establishmentId, establishmentId));
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Restaurante não encontrado." };
  const creds = row.provider === "zonesoft" ? readCredentials(row.ciphertext) : null;
  if (!creds) return { ok: false, code: "NO_CREDENTIALS", message: "Este restaurante não está ligado à ZoneSoft." };
  const body = JSON.stringify({ serial: creds.serial, store_id: creds.clientId || creds.storeId });
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: creds.appKey, "X-Integration-Signature": signRequest(body, creds.appSecret) },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    return res.ok ? { ok: true, status: res.status, detail } : { ok: false, code: "NETWORK", message: `A ZoneSoft respondeu ${res.status}.`, status: res.status, detail };
  } catch (err) {
    return { ok: false, code: "NETWORK", message: err instanceof Error ? err.message : "Sem ligação à ZoneSoft." };
  }
}

// ───────────── Estado da integração (Central) ─────────────

export interface ZoneSoftStatus {
  lastCatalogSyncAt: string | null;
  products: number;
  /** Últimas respostas do POS aos pedidos (motivo das recusas incluído). */
  events: { at: string; shortCode: string; status: string; reason: string | null }[];
}

export async function getZoneSoftStatus(db: Db, establishmentId: string): Promise<ZoneSoftStatus> {
  const [integration] = await db
    .select({ lastCatalogSyncAt: posIntegrations.lastCatalogSyncAt })
    .from(posIntegrations)
    .where(eq(posIntegrations.establishmentId, establishmentId));
  const productCount = await db.$count(products, eq(products.establishmentId, establishmentId));
  // Só os pedidos desde que o restaurante foi ligado à ZoneSoft (os anteriores eram de outro POS).
  const [linked] = await db
    .select({ at: auditLogs.createdAt })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "platform.link_zonesoft"), eq(auditLogs.entityId, establishmentId)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  const rows = await db
    .select({ at: orderEvents.createdAt, status: orderEvents.toStatus, detail: orderEvents.detail, shortCode: orders.shortCode })
    .from(orderEvents)
    .innerJoin(orders, eq(orders.id, orderEvents.orderId))
    .where(
      and(
        eq(orders.establishmentId, establishmentId),
        inArray(orderEvents.toStatus, ["SUBMITTED", "ACCEPTED", "REJECTED", "NEEDS_ATTENTION", "FAILED_RETRYING", "SERVED"]),
        linked ? gte(orderEvents.createdAt, linked.at) : undefined,
      ),
    )
    .orderBy(desc(orderEvents.createdAt))
    .limit(8);
  return {
    lastCatalogSyncAt: integration?.lastCatalogSyncAt?.toISOString() ?? null,
    products: productCount,
    events: rows.map((r) => {
      const d = (r.detail ?? {}) as { reason?: unknown };
      return { at: r.at.toISOString(), shortCode: r.shortCode, status: r.status, reason: typeof d.reason === "string" ? d.reason : null };
    }),
  };
}

export const ZSROI_TEST_ORDER_STATUS_URL = "https://zsroi.zonesoft.org/v1.0/testintegration/orderStatus";

/**
 * Conta demo: pede à ZoneSoft que simule o "aceite" do último pedido enviado (ainda à espera do POS).
 * A ZoneSoft responde chamando o nosso /order-status, como faria um POS real.
 */
export async function simulateZoneSoftAccept(
  db: Db,
  establishmentId: string,
  { fetchImpl = fetch, url = ZSROI_TEST_ORDER_STATUS_URL }: { fetchImpl?: typeof fetch; url?: string } = {},
): Promise<PingResult & { orderCode?: string }> {
  const [row] = await db
    .select({ provider: posIntegrations.provider, ciphertext: posIntegrations.credentialsCiphertext })
    .from(posIntegrations)
    .where(eq(posIntegrations.establishmentId, establishmentId));
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Restaurante não encontrado." };
  const creds = row.provider === "zonesoft" ? readCredentials(row.ciphertext) : null;
  if (!creds) return { ok: false, code: "NO_CREDENTIALS", message: "Este restaurante não está ligado à ZoneSoft." };
  const [order] = await db
    .select({ id: orders.id, shortCode: orders.shortCode })
    .from(orders)
    .where(and(eq(orders.establishmentId, establishmentId), eq(orders.status, "SUBMITTED")))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Não há nenhum pedido à espera de confirmação do POS." };
  const body = JSON.stringify({ serial: creds.serial, store_id: creds.clientId || creds.storeId, app_order_id: order.id, status: "accept", reason: "teste MESVIO" });
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: creds.appKey, "X-Integration-Signature": signRequest(body, creds.appSecret) },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    return res.ok
      ? { ok: true, status: res.status, detail, orderCode: order.shortCode }
      : { ok: false, code: "NETWORK", message: `A ZoneSoft respondeu ${res.status}.`, status: res.status, detail, orderCode: order.shortCode };
  } catch (err) {
    return { ok: false, code: "NETWORK", message: err instanceof Error ? err.message : "Sem ligação à ZoneSoft." };
  }
}
