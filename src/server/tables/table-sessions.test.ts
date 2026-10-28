import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import { auditLogs, orders, tableSessions } from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder, type PlaceOrderDeps } from "@/server/orders/place-order";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { applyStaffAction, setManualAcceptance } from "@/server/staff/staff-service";
import { closeTable, getTableBillByToken, listTables, SESSION_IDLE_MS } from "./table-sessions";

const [T1, T2] = [DEMO_TABLES[0], DEMO_TABLES[1]];

let db: Db;
let staff: StaffContext;
let now: Date;
let deps: PlaceOrderDeps;
beforeEach(async () => {
  db = await createTestDb();
  staff = (await resolveStaffContext(db, DEMO_USERS[2].userId))!;
  now = new Date("2026-10-22T13:00:00Z");
  const pos = new MockPosAdapter();
  deps = { db, resolvePos: () => pos, now: () => now };
});

/** Imperial 0,2 L = 2,50 €; Hambúrguer Swara = 18,00 €. */
const order = (table = T1, lines = [{ productRef: "D361", quantity: 1 }]) =>
  placeOrder({ tableToken: table.publicToken, idempotencyKey: randomUUID(), lines }, { clientIpHash: randomUUID() }, deps);

const bill = (table = T1) => getTableBillByToken(db, table.publicToken, now);

describe("conta da mesa", () => {
  it("mesa sem pedidos está livre", async () => {
    expect(await bill()).toEqual({
      tableLabel: "Mesa 1",
      openedAt: null,
      orders: [],
      totalCents: 0,
      paidCents: 0,
      dueCents: 0,
      pendingPaymentCents: 0,
      overpaidCents: 0,
      tipCents: 0,
      paymentsEnabled: true,
    });
  });

  it("o primeiro pedido abre a conta; os seguintes, de qualquer telemóvel, juntam-se a ela", async () => {
    await order();
    now = new Date(now.getTime() + 20 * 60_000);
    await order(T1, [{ productRef: "F162", quantity: 1, modifierRefs: ["GRP-BATATA-1"] } as never]);
    const b = (await bill())!;
    expect(b.openedAt).toBe("2026-10-22T13:00:00.000Z");
    expect(b.orders.map((o) => o.totalCents)).toEqual([250, 1800]);
    expect(b.totalCents).toBe(2050);
    expect(await db.select().from(tableSessions)).toHaveLength(1);
  });

  it("cada mesa tem a sua conta", async () => {
    await order(T1);
    await order(T2);
    await order(T2);
    expect((await bill(T1))!.totalCents).toBe(250);
    expect((await bill(T2))!.totalCents).toBe(500);
  });

  it("pedidos cancelados aparecem mas não contam para o total", async () => {
    await setManualAcceptance(db, staff, true);
    const a = await order();
    await order();
    if (!a.ok) throw new Error(a.message);
    await applyStaffAction(db, staff, a.order.id, "reject", deps);
    const b = (await bill())!;
    expect(b.orders.map((o) => [o.void, o.pending])).toEqual([[true, false], [false, true]]);
    expect(b.totalCents).toBe(250);
  });
});

describe("fechar a mesa", () => {
  it("limpa a mesa: os clientes seguintes começam uma conta nova", async () => {
    await order();
    expect(await closeTable(db, staff, T1.id, { now })).toMatchObject({ ok: true });
    expect((await bill())!.openedAt).toBeNull();

    now = new Date(now.getTime() + 60 * 60_000);
    await order();
    const b = (await bill())!;
    expect(b.orders).toHaveLength(1);
    expect(b.totalCents).toBe(250);
    expect(await db.select().from(tableSessions)).toHaveLength(2);
  });

  it("avisa se houver pedidos por resolver e só fecha com confirmação", async () => {
    await setManualAcceptance(db, staff, true);
    await order(); // à espera de aprovação
    const r = await closeTable(db, staff, T1.id, { now });
    expect(r).toMatchObject({ ok: false, code: "PENDING_ORDERS", pendingCount: 1 });
    expect((await bill())!.openedAt).not.toBeNull();
    // Fecho forçado cancela o pedido pendente (não pode chegar à cozinha depois de a mesa fechar).
    expect(await closeTable(db, staff, T1.id, { now, force: true })).toEqual({ ok: true, cancelled: ["001"], checkInPos: [] });
    expect((await db.select({ s: orders.status }).from(orders))[0].s).toBe("CANCELLED");
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "table.close"));
    expect(log).toMatchObject({ actorId: staff.userId, after: { tableId: T1.id, pendingAtClose: 1 } });
  });

  it("não fecha uma mesa já livre, nem mesas de outro restaurante", async () => {
    expect(await closeTable(db, staff, T1.id, { now })).toMatchObject({ code: "ALREADY_FREE" });
    await order();
    const other: StaffContext = { ...staff, establishmentId: randomUUID() };
    expect(await closeTable(db, other, T1.id, { now })).toMatchObject({ code: "NOT_FOUND" });
  });

  it("uma conta esquecida fecha sozinha 6 h depois do último pedido", async () => {
    await order();
    now = new Date(now.getTime() + SESSION_IDLE_MS + 60_000);
    expect((await bill())!.openedAt).toBeNull(); // já não aparece aos clientes
    await order();
    const sessions = await db.select().from(tableSessions).orderBy(tableSessions.openedAt);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].closedAt).toEqual(sessions[0].expiresAt);
    expect((await bill())!.orders).toHaveLength(1);
  });

  it("cada pedido fica ligado à sessão em que foi feito", async () => {
    const a = await order();
    await closeTable(db, staff, T1.id, { now });
    const b = await order();
    if (!a.ok || !b.ok) throw new Error();
    const rows = await db.select({ id: orders.id, s: orders.tableSessionId }).from(orders);
    expect(new Set(rows.map((r) => r.s)).size).toBe(2);
  });
});

describe("mesas no painel", () => {
  it("mostra mesas livres e ocupadas, com total e pedidos por resolver", async () => {
    await setManualAcceptance(db, staff, true);
    await order(T2);
    const tables = await listTables(db, staff, now);
    expect(tables.map((t) => t.label).slice(0, 3)).toEqual(["Mesa 1", "Mesa 2", "Mesa 3"]);
    expect(tables).toHaveLength(16); // 10 mesas + 6 espreguiçadeiras
    expect(tables[0].bill).toBeNull();
    expect(tables[1]).toMatchObject({ pendingCount: 1, bill: { totalCents: 250 } });
  });
});
