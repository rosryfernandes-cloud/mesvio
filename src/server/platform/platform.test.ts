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
import { confirmEnrollment, findPlatformAdmin, MFA_ATTEMPTS, startEnrollment, verifyMfa, type PlatformAdmin } from "./admin-auth";
import { totpCode, stepAt } from "./totp";
import { addTables, createRestaurant, getPlatformOverview, inviteOwner } from "./platform-service";

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

async function enrol(): Promise<string> {
  const { secret } = await startEnrollment(db, admin);
  expect(await confirmEnrollment(db, admin, totpCode(secret, stepAt(NOW)), NOW)).toEqual({ ok: true });
  return secret;
}

describe("2FA dos administradores", () => {
  it("abrir a configuração duas vezes mostra o mesmo segredo (e fica cifrado na BD)", async () => {
    const a = await startEnrollment(db, admin);
    const b = await startEnrollment(db, admin);
    expect(b.secret).toBe(a.secret);
    const [row] = await db.select().from(t.platformAdmins).where(eq(t.platformAdmins.userId, admin.userId));
    expect(row.totpPendingCiphertext).not.toContain(a.secret);
    expect(open(row.totpPendingCiphertext!)).toBe(a.secret);
  });

  it("o primeiro código certo ativa o 2FA; um código errado não", async () => {
    const { secret } = await startEnrollment(db, admin);
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
});
