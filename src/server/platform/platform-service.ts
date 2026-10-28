import "server-only";
import { PLANS, planAllowsPayments, type Plan } from "@/lib/plan";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sql, sum } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import {
  auditLogs,
  commissionRules,
  diningTables,
  establishments,
  memberships,
  orders,
  organizations,
  outbox,
  posIntegrations,
  staffProfiles,
} from "@/server/db/schema";
import { generateTableToken } from "@/server/tables/table-token";
import type { UserDirectory } from "@/server/auth/user-directory";
import { roundHalfUpDiv } from "@/lib/money";
import type { PlatformAdmin } from "./admin-auth";
import { isValidNif } from "@/lib/nif";
import { importCatalog } from "@/server/menu/own-menu";
import { resolvePosAdapter, type PosResolver } from "@/server/pos/registry";

/**
 * Serviço do painel central: lê e escreve em TODOS os restaurantes (ligação de sistema, fora do
 * RLS por tenant). Só pode ser chamado depois de guardPlatform (administrador com 2FA).
 */

/** Pedidos que contam para volume e comissão: confirmados pelo restaurante/POS. */
export const BILLABLE_STATUSES = ["ACCEPTED", "IN_PREPARATION", "SERVED"] as const;
export const DEFAULT_COMMISSION_BPS = 100;

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífenes.")
  .min(2)
  .max(60);

const tablesInput = z.object({
  count: z.int().min(0).max(300),
  prefix: z.string().trim().min(1).max(30),
  zone: z.string().trim().max(40).optional(),
  orderingMode: z.enum(["pay_later", "pay_first"]),
});

export const createRestaurantSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  nif: z.string().trim().regex(/^\d{9}$/, "O NIF tem 9 dígitos.").refine(isValidNif, "Este NIF não é válido (confirme os dígitos)."),
  billingEmail: z.email().max(200).optional().or(z.literal("")),
  name: z.string().trim().min(2).max(120),
  slug,
  address: z.string().trim().max(200).optional(),
  posProvider: z.enum(["mock", "zonesoft", "mesvio"]),
  plan: z.enum(PLANS).default("payments"),
  commissionBps: z.int().min(0).max(2000).default(DEFAULT_COMMISSION_BPS),
  tables: z.array(tablesInput).max(5),
  owner: z.object({
    email: z.email().max(200).transform((e) => e.trim().toLowerCase()),
    displayName: z.string().trim().max(80).optional(),
  }),
});
export type CreateRestaurantInput = z.input<typeof createRestaurantSchema>;

export const addTablesSchema = tablesInput;
export const inviteOwnerSchema = createRestaurantSchema.shape.owner;

export type PlatformResult<T = object> = ({ ok: true } & T) | { ok: false; code: "INVALID" | "CONFLICT" | "NOT_FOUND"; message: string };

const audit = (tx: Db, admin: PlatformAdmin, organizationId: string, action: string, entityId: string, after?: unknown) =>
  tx.insert(auditLogs).values({ organizationId, actorType: "admin", actorId: admin.userId, action, entityType: "establishment", entityId, after });

/** Cria mesas numeradas a seguir às que já existem com o mesmo prefixo (ex.: "Mesa 11", "Mesa 12"…). */
async function insertTables(tx: Db, organizationId: string, establishmentId: string, input: z.infer<typeof tablesInput>): Promise<number> {
  if (input.count === 0) return 0;
  const existing = await tx
    .select({ label: diningTables.label, posTableRef: diningTables.posTableRef })
    .from(diningTables)
    .where(eq(diningTables.establishmentId, establishmentId));
  const prefix = input.prefix.trim();
  const numbers = existing.map((t) => t.label.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\d+)$`))?.[1]).filter(Boolean).map(Number);
  const start = (numbers.length ? Math.max(...numbers) : 0) + 1;
  const refPrefix = input.orderingMode === "pay_first" ? prefix.slice(0, 1).toUpperCase() : "";
  const usedRefs = new Set(existing.map((t) => t.posTableRef));
  const rows = Array.from({ length: input.count }, (_, i) => {
    const n = start + i;
    let ref = `${refPrefix}${n}`;
    while (usedRefs.has(ref)) ref = `${ref}b`;
    usedRefs.add(ref);
    return {
      organizationId,
      establishmentId,
      label: `${prefix} ${n}`,
      // Referência da mesa no POS: a confirmar com o POS real na instalação (por omissão, o número).
      posTableRef: ref,
      publicToken: generateTableToken(),
      zone: input.zone || null,
      orderingMode: input.orderingMode,
    };
  });
  await tx.insert(diningTables).values(rows);
  return rows.length;
}

async function addOwner(tx: Db, organizationId: string, userId: string, email: string, displayName?: string): Promise<void> {
  await tx.insert(staffProfiles).values({ userId, email, displayName: displayName || null }).onConflictDoNothing();
  const already = await tx.$count(memberships, and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId), eq(memberships.role, "owner")));
  if (already === 0) await tx.insert(memberships).values({ organizationId, userId, role: "owner", establishmentId: null });
}

/** Novo cliente: organização, restaurante, POS, comissão, mesas/espreguiçadeiras e dono convidado. */
export async function createRestaurant(
  db: Db,
  admin: PlatformAdmin,
  raw: unknown,
  users: UserDirectory,
): Promise<PlatformResult<{ establishmentId: string; tablesCreated: number; ownerInvited: boolean }>> {
  const parsed = createRestaurantSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const input = parsed.data;

  const [nifTaken] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.nif, input.nif)).limit(1);
  if (nifTaken) return { ok: false, code: "CONFLICT", message: "Já existe um cliente com este NIF." };

  // O convite (email da Supabase) sai antes da transação: se falhar, nada fica criado.
  const { userId, invited } = await users.ensureUser(input.owner.email);

  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ legalName: input.legalName, nif: input.nif, billingEmail: input.billingEmail || null, status: "active" })
      .returning({ id: organizations.id });
    const [est] = await tx
      .insert(establishments)
      .values({ organizationId: org.id, name: input.name, slug: input.slug, address: input.address || null, plan: input.plan })
      .returning({ id: establishments.id });
    await tx.insert(posIntegrations).values({
      organizationId: org.id,
      establishmentId: est.id,
      provider: input.posProvider,
      // ZoneSoft: fica por configurar até haver credenciais (a ementa só mostra, não recebe pedidos).
      status: input.posProvider === "zonesoft" ? "not_configured" : "healthy",
    });
    await tx.insert(commissionRules).values({
      organizationId: org.id,
      rateBps: input.commissionBps,
      basis: "NET",
      effectiveFrom: new Date().toISOString().slice(0, 10),
      createdBy: admin.userId,
    });
    let tablesCreated = 0;
    for (const t of input.tables) tablesCreated += await insertTables(tx, org.id, est.id, t);
    await addOwner(tx, org.id, userId, input.owner.email, input.owner.displayName);
    await audit(tx, admin, org.id, "platform.create_restaurant", est.id, { name: input.name, tables: tablesCreated, owner: input.owner.email });
    return { ok: true, establishmentId: est.id, tablesCreated, ownerInvited: invited };
  });
}

async function establishmentOrg(db: Db, establishmentId: string): Promise<string | null> {
  const [e] = await db.select({ org: establishments.organizationId }).from(establishments).where(eq(establishments.id, establishmentId)).limit(1);
  return e?.org ?? null;
}

export async function addTables(db: Db, admin: PlatformAdmin, establishmentId: string, raw: unknown): Promise<PlatformResult<{ created: number }>> {
  const parsed = addTablesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const org = await establishmentOrg(db, establishmentId);
  if (!org) return { ok: false, code: "NOT_FOUND", message: "Restaurante não encontrado." };
  return db.transaction(async (tx) => {
    const created = await insertTables(tx, org, establishmentId, parsed.data);
    await audit(tx, admin, org, "platform.add_tables", establishmentId, { ...parsed.data, created });
    return { ok: true, created };
  });
}

/**
 * Passa o restaurante para "sem POS": a ementa atual (MockPOS ou POS) é copiada para a ementa
 * própria, editável no painel, e os pedidos passam a sair em talão na cozinha. Fotos, traduções e
 * esgotados mantêm-se (as referências dos pratos são as mesmas).
 */
export async function switchToOwnMenu(
  db: Db,
  admin: PlatformAdmin,
  establishmentId: string,
  resolvePos: PosResolver = resolvePosAdapter,
): Promise<PlatformResult<{ categories: number; products: number }>> {
  const org = await establishmentOrg(db, establishmentId);
  if (!org) return { ok: false, code: "NOT_FOUND", message: "Restaurante não encontrado." };
  const [integration] = await db.select({ provider: posIntegrations.provider }).from(posIntegrations).where(eq(posIntegrations.establishmentId, establishmentId));
  if (integration?.provider === "mesvio") return { ok: true, categories: 0, products: 0 };
  // Um POS ainda por ligar (ZoneSoft) não tem ementa para copiar: começa vazia.
  const catalog = integration ? await resolvePos(integration.provider, establishmentId).fetchCatalog().catch(() => null) : null;
  return db.transaction(async (tx) => {
    const imported = catalog ? await importCatalog(tx, org, establishmentId, catalog) : { categories: 0, products: 0 };
    await tx.update(posIntegrations).set({ provider: "mesvio", status: "healthy" }).where(eq(posIntegrations.establishmentId, establishmentId));
    await audit(tx, admin, org, "platform.switch_to_own_menu", establishmentId, { from: integration?.provider, ...imported });
    return { ok: true, ...imported };
  });
}

export async function inviteOwner(
  db: Db,
  admin: PlatformAdmin,
  establishmentId: string,
  raw: unknown,
  users: UserDirectory,
): Promise<PlatformResult<{ invited: boolean }>> {
  const parsed = inviteOwnerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID", message: "Indique um email válido." };
  const org = await establishmentOrg(db, establishmentId);
  if (!org) return { ok: false, code: "NOT_FOUND", message: "Restaurante não encontrado." };
  const { userId, invited } = await users.ensureUser(parsed.data.email);
  await db.transaction(async (tx) => {
    await addOwner(tx, org, userId, parsed.data.email, parsed.data.displayName);
    await audit(tx, admin, org, "platform.invite_owner", establishmentId, { email: parsed.data.email });
  });
  return { ok: true, invited };
}

/**
 * Mudar o plano do restaurante. Descer para um plano sem pagamentos desliga também o interruptor
 * dos pagamentos no painel, para não voltarem a aparecer sozinhos se subir outra vez.
 */
export async function setPlan(db: Db, admin: PlatformAdmin, establishmentId: string, raw: unknown): Promise<PlatformResult<{ plan: Plan }>> {
  const parsed = z.enum(PLANS).safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID", message: "Plano inválido." };
  const org = await establishmentOrg(db, establishmentId);
  if (!org) return { ok: false, code: "NOT_FOUND", message: "Restaurante não encontrado." };
  const plan = parsed.data;
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ plan: establishments.plan }).from(establishments).where(eq(establishments.id, establishmentId));
    await tx
      .update(establishments)
      .set({ plan, ...(planAllowsPayments(plan) ? {} : { paymentsEnabled: false }), updatedAt: new Date() })
      .where(eq(establishments.id, establishmentId));
    await audit(tx, admin, org, "platform.plan_changed", establishmentId, { from: before?.plan, to: plan });
  });
  return { ok: true, plan };
}

/** Início do mês corrente em Lisboa (o mês de faturação). */
export function monthStart(now = new Date()): Date {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit" }).format(now).split("-").map(Number);
  // Meia-noite de Lisboa do dia 1: UTC 00:00 menos o desvio (0 ou 1 h).
  const utcMidnight = Date.UTC(y, m - 1, 1);
  const offsetH = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hourCycle: "h23" }).format(new Date(utcMidnight)));
  return new Date(utcMidnight - offsetH * 3600_000);
}

export interface EstablishmentSummary {
  id: string;
  organizationId: string;
  name: string;
  legalName: string;
  status: string;
  posProvider: string;
  posStatus: string;
  tables: number;
  owners: number;
  ordersThisMonth: number;
  netCentsThisMonth: number;
  grossCentsThisMonth: number;
  commissionBps: number;
  commissionCentsThisMonth: number;
  needsAttention: number;
  lastOrderAt: string | null;
  /** Conta Stripe do restaurante ligada (pagamentos no telemóvel). */
  stripeConnected: boolean;
  /** Plano contratado (o que a app deixa fazer). */
  plan: Plan;
}

export interface PlatformAlert {
  level: "danger" | "warning" | "info";
  establishmentId?: string;
  text: string;
}

export interface PlatformOverview {
  periodStart: string;
  totals: { restaurants: number; ordersThisMonth: number; netCentsThisMonth: number; commissionCentsThisMonth: number };
  establishments: EstablishmentSummary[];
  alerts: PlatformAlert[];
}

/** Taxa em vigor de cada organização (regra mais recente com início ≤ hoje). */
async function commissionRates(db: Db, today: string): Promise<Map<string, number>> {
  const rules = await db
    .select({ org: commissionRules.organizationId, est: commissionRules.establishmentId, bps: commissionRules.rateBps })
    .from(commissionRules)
    .where(and(lte(commissionRules.effectiveFrom, today), or(isNull(commissionRules.effectiveTo), gte(commissionRules.effectiveTo, today))))
    .orderBy(desc(commissionRules.effectiveFrom), desc(commissionRules.createdAt));
  const map = new Map<string, number>();
  for (const r of rules) {
    const key = r.est ?? r.org;
    if (!map.has(key)) map.set(key, r.bps);
  }
  return map;
}

export async function getPlatformOverview(db: Db, now = new Date()): Promise<PlatformOverview> {
  const from = monthStart(now);
  const today = now.toISOString().slice(0, 10);
  const [ests, tableCounts, ownerCounts, monthly, attention, lastOrders, dead, rates] = await Promise.all([
    db
      .select({
        id: establishments.id,
        organizationId: establishments.organizationId,
        name: establishments.name,
        legalName: organizations.legalName,
        status: organizations.status,
        posProvider: posIntegrations.provider,
        posStatus: posIntegrations.status,
        stripeAccountId: establishments.stripeAccountId,
        plan: establishments.plan,
      })
      .from(establishments)
      .innerJoin(organizations, eq(organizations.id, establishments.organizationId))
      .leftJoin(posIntegrations, eq(posIntegrations.establishmentId, establishments.id))
      .orderBy(asc(establishments.name)),
    db.select({ est: diningTables.establishmentId, n: count() }).from(diningTables).where(eq(diningTables.active, true)).groupBy(diningTables.establishmentId),
    db
      .select({ org: memberships.organizationId, n: count() })
      .from(memberships)
      .where(eq(memberships.role, "owner"))
      .groupBy(memberships.organizationId),
    db
      .select({ est: orders.establishmentId, n: count(), net: sum(orders.totalNetCents), gross: sum(orders.totalGrossCents) })
      .from(orders)
      .where(and(gte(orders.createdAt, from), inArray(orders.status, [...BILLABLE_STATUSES])))
      .groupBy(orders.establishmentId),
    db
      .select({ est: orders.establishmentId, n: count() })
      .from(orders)
      .where(and(eq(orders.status, "NEEDS_ATTENTION"), gte(orders.createdAt, new Date(now.getTime() - 24 * 3600_000))))
      .groupBy(orders.establishmentId),
    db.select({ est: orders.establishmentId, at: sql<Date>`max(${orders.createdAt})` }).from(orders).groupBy(orders.establishmentId),
    db
      .select({ org: outbox.organizationId, n: count() })
      .from(outbox)
      .where(and(eq(outbox.status, "DEAD"), gte(outbox.createdAt, new Date(now.getTime() - 7 * 24 * 3600_000))))
      .groupBy(outbox.organizationId),
    commissionRates(db, today),
  ]);

  const byEst = <T extends { est: string }>(rows: T[]) => new Map(rows.map((r) => [r.est, r]));
  const tablesM = byEst(tableCounts);
  const monthlyM = byEst(monthly);
  const attentionM = byEst(attention);
  const lastM = byEst(lastOrders);
  const ownersM = new Map(ownerCounts.map((r) => [r.org, r.n]));
  const deadM = new Map(dead.map((r) => [r.org, r.n]));

  const establishmentsOut: EstablishmentSummary[] = ests.map((e) => {
    const m = monthlyM.get(e.id);
    const net = Number(m?.net ?? 0);
    const bps = rates.get(e.id) ?? rates.get(e.organizationId) ?? DEFAULT_COMMISSION_BPS;
    const last = lastM.get(e.id)?.at;
    return {
      id: e.id,
      organizationId: e.organizationId,
      name: e.name,
      legalName: e.legalName,
      status: e.status,
      posProvider: e.posProvider ?? "—",
      posStatus: e.posStatus ?? "not_configured",
      tables: tablesM.get(e.id)?.n ?? 0,
      owners: ownersM.get(e.organizationId) ?? 0,
      ordersThisMonth: m?.n ?? 0,
      netCentsThisMonth: net,
      grossCentsThisMonth: Number(m?.gross ?? 0),
      commissionBps: bps,
      commissionCentsThisMonth: roundHalfUpDiv(net * bps, 10_000),
      needsAttention: attentionM.get(e.id)?.n ?? 0,
      lastOrderAt: last ? new Date(last).toISOString() : null,
      stripeConnected: !!e.stripeAccountId,
      plan: e.plan,
    };
  });

  const alerts: PlatformAlert[] = [];
  for (const e of establishmentsOut) {
    if (e.needsAttention > 0)
      alerts.push({ level: "danger", establishmentId: e.id, text: `${e.name}: ${e.needsAttention} pedido(s) não chegaram ao POS nas últimas 24 h.` });
    if (e.posStatus === "failing" || e.posStatus === "degraded")
      alerts.push({ level: "danger", establishmentId: e.id, text: `${e.name}: ligação ao POS com problemas (${e.posStatus}).` });
    if (e.posStatus === "not_configured")
      alerts.push({ level: "info", establishmentId: e.id, text: `${e.name}: POS por configurar (a ementa ainda não recebe pedidos).` });
    if (e.owners === 0) alerts.push({ level: "warning", establishmentId: e.id, text: `${e.name}: sem dono com acesso ao painel.` });
    if (e.tables === 0) alerts.push({ level: "warning", establishmentId: e.id, text: `${e.name}: ainda sem mesas nem QR Codes.` });
    if (!e.stripeConnected && process.env.STRIPE_SECRET_KEY)
      alerts.push({ level: "info", establishmentId: e.id, text: `${e.name}: pagamentos no telemóvel por ligar (o dono liga a conta Stripe no painel, separador Mesas).` });
  }
  for (const [org, n] of deadM) {
    const e = establishmentsOut.find((x) => x.organizationId === org);
    alerts.push({ level: "danger", establishmentId: e?.id, text: `${e?.name ?? "Organização"}: ${n} envio(s) ao POS desistidos nos últimos 7 dias.` });
  }

  return {
    periodStart: from.toISOString(),
    totals: {
      restaurants: establishmentsOut.length,
      ordersThisMonth: establishmentsOut.reduce((a, e) => a + e.ordersThisMonth, 0),
      netCentsThisMonth: establishmentsOut.reduce((a, e) => a + e.netCentsThisMonth, 0),
      commissionCentsThisMonth: establishmentsOut.reduce((a, e) => a + e.commissionCentsThisMonth, 0),
    },
    establishments: establishmentsOut,
    alerts: alerts.sort((a, b) => ["danger", "warning", "info"].indexOf(a.level) - ["danger", "warning", "info"].indexOf(b.level)),
  };
}

export interface EstablishmentDetail {
  summary: EstablishmentSummary;
  slug: string;
  address: string | null;
  billingEmail: string | null;
  nif: string;
  tables: { id: string; label: string; zone: string | null; orderingMode: string; posTableRef: string | null; publicToken: string; active: boolean }[];
  owners: { userId: string; email: string; displayName: string | null }[];
  recentOrders: { id: string; shortCode: string; status: string; totalCents: number; createdAt: string; tableLabel: string }[];
}

export async function getEstablishmentDetail(db: Db, establishmentId: string, now = new Date()): Promise<EstablishmentDetail | null> {
  const overview = await getPlatformOverview(db, now);
  const summary = overview.establishments.find((e) => e.id === establishmentId);
  if (!summary) return null;
  const [[est], tables, owners, recent] = await Promise.all([
    db
      .select({ slug: establishments.slug, address: establishments.address, billingEmail: organizations.billingEmail, nif: organizations.nif })
      .from(establishments)
      .innerJoin(organizations, eq(organizations.id, establishments.organizationId))
      .where(eq(establishments.id, establishmentId)),
    db
      .select({
        id: diningTables.id,
        label: diningTables.label,
        zone: diningTables.zone,
        orderingMode: diningTables.orderingMode,
        posTableRef: diningTables.posTableRef,
        publicToken: diningTables.publicToken,
        active: diningTables.active,
      })
      .from(diningTables)
      .where(eq(diningTables.establishmentId, establishmentId))
      .orderBy(asc(diningTables.label)),
    db
      .select({ userId: memberships.userId, email: staffProfiles.email, displayName: staffProfiles.displayName })
      .from(memberships)
      .innerJoin(staffProfiles, eq(staffProfiles.userId, memberships.userId))
      .where(and(eq(memberships.organizationId, summary.organizationId), eq(memberships.role, "owner"))),
    db
      .select({
        id: orders.id,
        shortCode: orders.shortCode,
        status: orders.status,
        totalCents: orders.totalGrossCents,
        createdAt: orders.createdAt,
        tableLabel: diningTables.label,
      })
      .from(orders)
      .innerJoin(diningTables, eq(diningTables.id, orders.tableId))
      .where(eq(orders.establishmentId, establishmentId))
      .orderBy(desc(orders.createdAt))
      .limit(20),
  ]);
  const natural = new Intl.Collator("pt", { numeric: true });
  return {
    summary,
    ...est,
    tables: tables.sort((a, b) => natural.compare(a.zone ?? "", b.zone ?? "") || natural.compare(a.label, b.label)),
    owners,
    recentOrders: recent.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
  };
}
