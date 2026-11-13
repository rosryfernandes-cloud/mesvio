import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { DEMO_PLATFORM_ADMIN } from "@/server/db/seed-demo";
import { DEMO_ESTABLISHMENT } from "@/server/pos/mock/demo-data";
import type { UserDirectory } from "@/server/auth/user-directory";
import { resolveStaffContext } from "@/server/staff/context";
import { getBoard } from "@/server/staff/staff-service";
import { open } from "@/server/security/secret-box";
import { confirmEnrollment, findPlatformAdmin, MFA_ATTEMPTS, startEnrollment as start, verifyMfa, type PlatformAdmin } from "./admin-auth";
import { ACTIVATION_TTL_MS, generateActivationCode, hashActivationCode } from "./activation";
import { totpCode, stepAt } from "./totp";
import { addTables, createRestaurant, getPlatformOverview, inviteOwner, setupProgress, staffAddTables, STAFF_MAX_TABLES } from "./platform-service";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { PLAN_MONTHLY_CENTS } from "@/lib/plan";

let db: Db;
let admin: PlatformAdmin;
const invited: string[] = [];
const users: UserDirectory = {
  async ensureUser(email) {
    invited.push(email);
    return { userId: randomUUID(), invited: true };
  },
};

beforeEach(async () => {
  db = await createTestDb();
  admin = (await findPlatformAdmin(db, DEMO_PLATFORM_ADMIN.userId))!;
  invited.length = 0;
});

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);

/** Início da configuração no modo de desenvolvimento (sem código de ativação). */
async function startEnrollment(a: PlatformAdmin) {
  const r = await start(db, a, { requireActivation: false });
  if (!r.ok) throw new Error(r.message);
  return r;
}

async function enrol(): Promise<string> {
  const { secret } = await startEnrollment(admin);
  expect(await confirmEnrollment(db, admin, totpCode(secret, stepAt(NOW)), NOW)).toEqual({ ok: true });
  return secret;
}

describe("2FA dos administradores", () => {
  it("abrir a configuração duas vezes mostra o mesmo segredo (e fica cifrado na BD)", async () => {
    const a = await startEnrollment(admin);
    const b = await startEnrollment(admin);
    expect(b.secret).toBe(a.secret);
    const [row] = await db.select().from(t.platformAdmins).where(eq(t.platformAdmins.userId, admin.userId));
    expect(row.totpPendingCiphertext).not.toContain(a.secret);
    expect(open(row.totpPendingCiphertext!)).toBe(a.secret);
  });

  it("o primeiro código certo ativa o 2FA; um código errado não", async () => {
    const { secret } = await startEnrollment(admin);
    expect((await confirmEnrollment(db, admin, "000000", NOW)).ok).toBe(false);
    expect(await confirmEnrollment(db, admin, totpCode(secret, stepAt(NOW)), NOW)).toEqual({ ok: true });
    const fresh = (await findPlatformAdmin(db, admin.userId))!;
    expect(fresh.totpSecretCiphertext).toBeTruthy();
    expect(fresh.totpPendingCiphertext).toBeNull();
  });

  it("à entrada, cada código só serve uma vez", async () => {
    const secret = await enrol();
    const later = NOW + 60_000;
    const code = totpCode(secret, stepAt(later));
    expect(await verifyMfa(db, admin, code, later)).toEqual({ ok: true });
    expect((await verifyMfa(db, admin, code, later)).ok).toBe(false);
  });

  it("depois de várias tentativas erradas, bloqueia mesmo com o código certo", async () => {
    const secret = await enrol();
    // A confirmação da configuração já gastou uma tentativa da janela.
    for (let i = 0; i < MFA_ATTEMPTS.limit - 1; i++) await verifyMfa(db, admin, "000000", NOW + 60_000);
    const r = await verifyMfa(db, admin, totpCode(secret, stepAt(NOW + 60_000)), NOW + 60_000);
    expect(r).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });
});

const input = {
  legalName: "Praia Azul, Lda.",
  nif: "509999999",
  name: "Bar Praia Azul",
  slug: "praia-azul",
  posProvider: "mock" as const,
  commissionBps: 150,
  tables: [
    { count: 3, prefix: "Mesa", zone: "Esplanada", orderingMode: "pay_later" as const },
    { count: 2, prefix: "Cama", zone: "Praia", orderingMode: "pay_first" as const },
  ],
  owner: { email: "Dono@PraiaAzul.pt", displayName: "João" },
};

describe("código de ativação do 2FA (produção)", () => {
  async function issue(expiresInMs = ACTIVATION_TTL_MS) {
    const code = generateActivationCode();
    await db
      .update(t.platformAdmins)
      .set({ enrollmentCodeHash: hashActivationCode(code), enrollmentCodeExpiresAt: new Date(NOW + expiresInMs) })
      .where(eq(t.platformAdmins.userId, admin.userId));
    return code;
  }

  it("sem o código, quem só tem o email não consegue configurar o 2FA", async () => {
    await issue();
    expect(await start(db, admin, { requireActivation: true, now: NOW })).toMatchObject({ ok: false, code: "ACTIVATION_INVALID" });
    expect(await start(db, admin, { requireActivation: true, activationCode: "AAAA-BBBB-CCCC", now: NOW })).toMatchObject({
      ok: false,
      code: "ACTIVATION_INVALID",
    });
    const [row] = await db.select().from(t.platformAdmins).where(eq(t.platformAdmins.userId, admin.userId));
    expect(row.totpPendingCiphertext).toBeNull();
  });

  it("aceita o código (com ou sem hífenes, minúsculas) e deixa de o aceitar depois de configurado", async () => {
    const code = await issue();
    const r = await start(db, admin, { requireActivation: true, activationCode: code.toLowerCase().replace(/-/g, ""), now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await confirmEnrollment(db, admin, totpCode(r.secret, stepAt(NOW)), NOW)).toEqual({ ok: true });
    const [row] = await db.select().from(t.platformAdmins).where(eq(t.platformAdmins.userId, admin.userId));
    expect(row.enrollmentCodeHash).toBeNull();
    expect(await start(db, admin, { requireActivation: true, activationCode: code, now: NOW })).toMatchObject({ ok: false, code: "ALREADY_ENROLLED" });
  });

  it("recusa códigos expirados", async () => {
    const code = await issue(-1000);
    expect(await start(db, admin, { requireActivation: true, activationCode: code, now: NOW })).toMatchObject({ ok: false, code: "ACTIVATION_INVALID" });
  });
});

describe("criar restaurantes no painel central", () => {
  it("cria organização, restaurante, POS, comissão, lugares e convida o dono", async () => {
    const r = await createRestaurant(db, admin, input, users);
    expect(r).toMatchObject({ ok: true, tablesCreated: 5, ownerInvited: true });
    if (!r.ok) return;
    expect(invited).toEqual(["dono@praiaazul.pt"]);
    const tables = await db.select().from(t.diningTables).where(eq(t.diningTables.establishmentId, r.establishmentId));
    expect(tables.map((x) => x.label).sort()).toEqual(["Cama 1", "Cama 2", "Mesa 1", "Mesa 2", "Mesa 3"]);
    expect(new Set(tables.map((x) => x.publicToken)).size).toBe(5);
    expect(tables.find((x) => x.label === "Cama 1")).toMatchObject({ orderingMode: "pay_first", zone: "Praia", posTableRef: "C1" });

    // O dono convidado entra no painel do restaurante novo, e só nesse.
    const owners = await db
      .select()
      .from(t.memberships)
      .innerJoin(t.establishments, eq(t.establishments.organizationId, t.memberships.organizationId))
      .where(and(eq(t.establishments.id, r.establishmentId), eq(t.memberships.role, "owner")));
    expect(owners).toHaveLength(1);
    const ctx = (await resolveStaffContext(db, owners[0].memberships.userId))!;
    expect(ctx.establishmentId).toBe(r.establishmentId);
    expect(ctx.establishments.map((e) => e.id)).toEqual([r.establishmentId]);
    expect((await getBoard(db, ctx)).establishmentName).toBe("Bar Praia Azul");
  });

  it("recusa NIF repetido e dados inválidos", async () => {
    expect((await createRestaurant(db, admin, input, users)).ok).toBe(true);
    expect(await createRestaurant(db, admin, { ...input, slug: "outro" }, users)).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(await createRestaurant(db, admin, { ...input, nif: "123" }, users)).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("acrescentar mesas continua a numeração", async () => {
    const r = await createRestaurant(db, admin, input, users);
    if (!r.ok) throw new Error();
    expect(await addTables(db, admin, r.establishmentId, { count: 2, prefix: "Mesa", zone: "Esplanada", orderingMode: "pay_later" })).toEqual({ ok: true, created: 2 });
    const labels = (await db.select().from(t.diningTables).where(eq(t.diningTables.establishmentId, r.establishmentId))).map((x) => x.label);
    expect(labels).toContain("Mesa 5");
    expect((await inviteOwner(db, admin, r.establishmentId, { email: "socio@praiaazul.pt" }, users)).ok).toBe(true);
  });
});

describe("lugares criados pelo dono no painel", () => {
  it("numera a seguir aos que existem e respeita os limites", async () => {
    const owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
    const before = await db.$count(t.diningTables, eq(t.diningTables.establishmentId, owner.establishmentId));
    expect(await staffAddTables(db, owner, { count: 3, prefix: "Cama", zone: "Praia", orderingMode: "pay_first" })).toEqual({ ok: true, created: 3 });
    const labels = (await db.select({ label: t.diningTables.label }).from(t.diningTables).where(eq(t.diningTables.establishmentId, owner.establishmentId))).map((r) => r.label);
    expect(labels.length).toBe(before + 3);
    expect(await staffAddTables(db, owner, { count: 0, prefix: "Mesa", orderingMode: "pay_later" })).toMatchObject({ ok: false, code: "INVALID" });
    expect(await staffAddTables(db, owner, { count: 100, prefix: "Mesa", orderingMode: "pay_later" })).toMatchObject({ ok: true });
    for (let i = 0; before + 103 + i * 100 + 100 <= STAFF_MAX_TABLES; i++) await staffAddTables(db, owner, { count: 100, prefix: "Extra", orderingMode: "pay_later" });
    expect(await staffAddTables(db, owner, { count: 100, prefix: "Mesa", orderingMode: "pay_later" })).toMatchObject({ ok: false, code: "CONFLICT" });
  });
});

describe("visão geral", () => {
  it("conta só pedidos confirmados do mês e calcula a comissão com a taxa do cliente", async () => {
    const r = await createRestaurant(db, admin, input, users);
    if (!r.ok) throw new Error();
    const [table] = await db.select().from(t.diningTables).where(eq(t.diningTables.establishmentId, r.establishmentId)).limit(1);
    const [est] = await db.select().from(t.establishments).where(eq(t.establishments.id, r.establishmentId));
    const order = (status: (typeof t.orderStatus.enumValues)[number], net: number) => ({
      organizationId: est.organizationId,
      establishmentId: est.id,
      tableId: table.id,
      idempotencyKey: randomUUID(),
      shortCode: String(Math.floor(Math.random() * 999)),
      status,
      totalGrossCents: Math.round(net * 1.13),
      totalNetCents: net,
    });
    await db.insert(t.orders).values([order("ACCEPTED", 10_000), order("SERVED", 5_000), order("CANCELLED", 99_999), order("NEEDS_ATTENTION", 2_000)]);

    const o = await getPlatformOverview(db);
    const e = o.establishments.find((x) => x.id === r.establishmentId)!;
    expect(e).toMatchObject({ ordersThisMonth: 2, netCentsThisMonth: 15_000, commissionBps: 150, commissionCentsThisMonth: 225, tables: 5, owners: 1, needsAttention: 1 });
    expect(o.alerts.some((a) => a.establishmentId === r.establishmentId && a.level === "danger")).toBe(true);
    // A demo (sem regra de comissão) usa 1%.
    expect(o.establishments.find((x) => x.id === DEMO_ESTABLISHMENT.id)!.commissionBps).toBe(100);
  });

  it("o MRR só conta mensalidades ativas e a central avisa de atrasos e restaurantes parados", async () => {
    const r = await createRestaurant(db, admin, input, users);
    if (!r.ok) throw new Error();
    const [table] = await db.select().from(t.diningTables).where(eq(t.diningTables.establishmentId, r.establishmentId)).limit(1);
    const [est] = await db.select().from(t.establishments).where(eq(t.establishments.id, r.establishmentId));
    const now = new Date("2026-11-20T12:00:00Z");
    const set = (billingStatus: string) => db.update(t.establishments).set({ plan: "orders", billingStatus }).where(eq(t.establishments.id, est.id));
    const alertsOf = async () => (await getPlatformOverview(db, now)).alerts.filter((a) => a.establishmentId === est.id).map((a) => a.text);

    await db.insert(t.orders).values({
      organizationId: est.organizationId,
      establishmentId: est.id,
      tableId: table.id,
      idempotencyKey: randomUUID(),
      shortCode: "001",
      status: "ACCEPTED",
      totalGrossCents: 1130,
      totalNetCents: 1000,
      createdAt: new Date("2026-11-10T12:00:00Z"),
    });

    await set("trialing");
    expect((await getPlatformOverview(db, now)).totals.mrrCents).toBe(0);
    await set("active");
    const o = await getPlatformOverview(db, now);
    expect(o.totals.mrrCents).toBe(PLAN_MONTHLY_CENTS.orders);
    expect(o.establishments.find((x) => x.id === est.id)).toMatchObject({ billingStatus: "active", daysSinceLastOrder: 10 });
    expect(await alertsOf()).toContain("Bar Praia Azul: sem pedidos há 10 dias.");
    await set("past_due");
    expect(await alertsOf()).toContain("Bar Praia Azul: mensalidade em atraso.");
    expect((await getPlatformOverview(db, now)).totals.mrrCents).toBe(0);
    // Quem nunca recebeu pedidos ainda está a arrancar: não há aviso de parado.
    expect((await getPlatformOverview(db, now)).alerts.some((a) => a.establishmentId === DEMO_ESTABLISHMENT.id && a.text.includes("sem pedidos"))).toBe(false);
  });

  it("mostra o arranque de cada restaurante e avisa quando fica parado", async () => {
    const r = await createRestaurant(db, admin, input, users);
    if (!r.ok) throw new Error();
    const [est] = await db.select().from(t.establishments).where(eq(t.establishments.id, r.establishmentId));
    const day = 24 * 3600_000;
    const at = (days: number) => new Date(est.createdAt.getTime() + days * day);
    const setupOf = async (now: Date) => (await getPlatformOverview(db, now)).establishments.find((x) => x.id === est.id)!.setup;
    const stalled = async (now: Date) => (await getPlatformOverview(db, now)).alerts.some((a) => a.establishmentId === est.id && a.text.includes("arranque parado"));

    // Criado com dono convidado e mesas: faltam a ementa, o logótipo e o primeiro pedido.
    const s = await setupOf(at(0));
    expect(s).toMatchObject({ done: 2, total: 5, daysSinceCreated: 0 });
    expect(s.next?.label).toBe("Ementa com pratos");
    expect(await stalled(at(1))).toBe(false);
    expect(await stalled(at(3))).toBe(true);
  });
});

describe("progresso do arranque", () => {
  it("segue a ordem dos passos e fica completo quando está tudo feito", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const base = { owners: 1, products: 0, tables: 0, hasLogo: false, hasOrders: false, createdAt: new Date("2026-11-17T09:00:00Z") };
    expect(setupProgress(base, now)).toMatchObject({ done: 1, daysSinceCreated: 3, next: { id: "menu" } });
    expect(setupProgress({ ...base, products: 30, tables: 8 }, now).next?.id).toBe("logo");
    expect(setupProgress({ ...base, products: 30, tables: 8, hasLogo: true, hasOrders: true }, now)).toMatchObject({ done: 5, next: null });
    // A ementa do restaurante de demonstração não está na base de dados, mas existe.
    expect(setupProgress({ ...base, isDemo: true }, now).next?.id).toBe("tables");
  });
});
