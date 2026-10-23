import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type Db } from "./client";
import * as t from "./schema";
import { queryRows, withTenant } from "./tenant";
import { DEMO_ESTABLISHMENT, DEMO_ORGANIZATION, DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder } from "@/server/orders/place-order";
import { getOrderForTable } from "@/server/orders/order-view";
import { applyStaffAction, getBoard } from "@/server/staff/staff-service";
import { resolveStaffContext } from "@/server/staff/context";
import { listTeam } from "@/server/staff/team-service";

/** Segundo restaurante (organização B), criado como sistema, com uma mesa e um pedido. */
const B = {
  org: "00000000-0000-4000-8000-00000000b001",
  est: "00000000-0000-4000-8000-00000000b010",
  table: "00000000-0000-4000-8000-00000000b100",
  token: "BBBBBBBBBBBBBBBBBBBBBB",
  order: "00000000-0000-4000-8000-00000000b500",
  owner: "00000000-0000-4000-8000-00000000b2a1",
};
const A = { org: DEMO_ORGANIZATION.id, est: DEMO_ESTABLISHMENT.id };

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
  await db.insert(t.organizations).values({ id: B.org, legalName: "Outro Restaurante, Lda.", nif: "999999991", status: "active" });
  await db.insert(t.establishments).values({ id: B.est, organizationId: B.org, name: "Outro Restaurante", slug: "outro" });
  await db.insert(t.posIntegrations).values({ organizationId: B.org, establishmentId: B.est, provider: "mock" });
  await db.insert(t.diningTables).values({ id: B.table, organizationId: B.org, establishmentId: B.est, label: "Mesa B1", posTableRef: "1", publicToken: B.token });
  await db.insert(t.orders).values({
    id: B.order, organizationId: B.org, establishmentId: B.est, tableId: B.table, idempotencyKey: randomUUID(),
    shortCode: "001", status: "NEEDS_ATTENTION", totalGrossCents: 999, totalNetCents: 884,
  });
  await db.insert(t.orderItems).values({
    organizationId: B.org, orderId: B.order, lineNo: 1, posProductRef: "X", name: "Segredo de B", unitPriceCents: 999, vatRateBps: 1300, quantity: 1, lineGrossCents: 999,
  });
  await db.insert(t.staffProfiles).values({ userId: B.owner, email: "dono@outro.example.com" });
  await db.insert(t.memberships).values({ organizationId: B.org, userId: B.owner, role: "owner" });
});

describe("isolamento entre restaurantes (RLS)", () => {
  it("todas as tabelas com organization_id têm RLS ativo e política", async () => {
    const rows = await queryRows<{ table_name: string; rls: boolean; policies: number }>(
      db,
      sql`select c.table_name, cl.relrowsecurity as rls,
            (select count(*)::int from pg_policies p where p.tablename = c.table_name) as policies
          from information_schema.columns c
          join pg_class cl on cl.relname = c.table_name
          where c.table_schema = 'public' and c.column_name = 'organization_id'`,
    );
    expect(rows.length).toBeGreaterThan(15);
    const unprotected = rows.filter((r) => !r.rls || r.policies === 0).map((r) => r.table_name);
    expect(unprotected).toEqual([]);
  });

  it("dentro do contexto de A não se vê nada de B, em nenhuma tabela", async () => {
    await withTenant(db, { organizationId: A.org }, async (tx) => {
      expect((await tx.select().from(t.orders)).every((o) => o.organizationId === A.org)).toBe(true);
      expect(await tx.select().from(t.orders).where(eq(t.orders.id, B.order))).toHaveLength(0);
      expect(await tx.select().from(t.orderItems).where(eq(t.orderItems.orderId, B.order))).toHaveLength(0);
      expect(await tx.select().from(t.establishments).where(eq(t.establishments.id, B.est))).toHaveLength(0);
      expect(await tx.select().from(t.diningTables).where(eq(t.diningTables.id, B.table))).toHaveLength(0);
      expect(await tx.select().from(t.organizations).where(eq(t.organizations.id, B.org))).toHaveLength(0);
      expect(await tx.select().from(t.memberships).where(eq(t.memberships.userId, B.owner))).toHaveLength(0);
      expect(await tx.select().from(t.staffProfiles).where(eq(t.staffProfiles.userId, B.owner))).toHaveLength(0);
    });
  });

  it("A não consegue alterar nem apagar dados de B (mesmo sem filtro na consulta)", async () => {
    await withTenant(db, { organizationId: A.org }, async (tx) => {
      const updated = await tx.update(t.orders).set({ status: "CANCELLED" }).returning({ id: t.orders.id });
      expect(updated.every((u) => u.id !== B.order)).toBe(true);
      await tx.delete(t.orderItems).where(eq(t.orderItems.orderId, B.order));
    });
    const [still] = await db.select().from(t.orders).where(eq(t.orders.id, B.order));
    expect(still.status).toBe("NEEDS_ATTENTION");
    expect(await db.select().from(t.orderItems).where(eq(t.orderItems.orderId, B.order))).toHaveLength(1);
  });

  it("A não consegue escrever linhas em nome de B", async () => {
    const err = await withTenant(db, { organizationId: A.org }, (tx) =>
      tx.insert(t.auditLogs).values({ organizationId: B.org, actorType: "user", action: "x", entityType: "y" }),
    ).catch((e: Error & { cause?: Error }) => e);
    // O Drizzle embrulha o erro do Postgres ("Failed query…"); a causa é a política RLS.
    expect((err as Error & { cause?: Error }).cause?.message).toMatch(/row-level security/);
  });

  it("sem contexto definido, app_user não vê nenhum restaurante", async () => {
    const orders = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_user`);
      return tx.select().from(t.orders);
    });
    expect(orders).toHaveLength(0);
  });

  it("o cliente de uma mesa de A não vê pedidos de B, mesmo sabendo o id", async () => {
    expect(await getOrderForTable(db, DEMO_TABLES[0].publicToken, B.order)).toBeNull();
    expect((await getOrderForTable(db, B.token, B.order))?.lines[0].name).toBe("Segredo de B");
  });

  it("o painel de A não mostra nem deixa agir sobre pedidos de B", async () => {
    const pos = new MockPosAdapter();
    await placeOrder(
      { tableToken: DEMO_TABLES[0].publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D361", quantity: 1 }] },
      { clientIpHash: "x" },
      { db, resolvePos: () => pos },
    );
    const staffA = (await resolveStaffContext(db, "00000000-0000-4000-8000-0000000002a3"))!;
    const board = await getBoard(db, staffA);
    expect(board.orders.length).toBe(1);
    expect(board.orders.some((o) => o.id === B.order)).toBe(false);
    expect(await applyStaffAction(db, staffA, B.order, "handled")).toMatchObject({ code: "NOT_FOUND" });

    // Mesmo forjando o contexto (org A, estabelecimento B), o RLS não deixa ver B.
    const forged = { ...staffA, establishmentId: B.est };
    expect((await getBoard(db, forged).catch(() => ({ orders: [] }))).orders).toHaveLength(0);
  });

  it("cada utilizador só obtém contexto nos restaurantes onde é membro", async () => {
    expect((await resolveStaffContext(db, B.owner))?.establishmentId).toBe(B.est);
    const ownerA = (await resolveStaffContext(db, "00000000-0000-4000-8000-0000000002a1", B.est))!;
    expect(ownerA.establishmentId).toBe(A.est); // pediu B, recebe o seu
    expect(await resolveStaffContext(db, randomUUID())).toBeNull();
    expect((await listTeam(db, ownerA)).some((m) => m.userId === B.owner)).toBe(false);
  });
});
