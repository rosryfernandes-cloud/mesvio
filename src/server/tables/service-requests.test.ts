import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder } from "@/server/orders/place-order";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { getBoard } from "@/server/staff/staff-service";
import { actOnCall, CALL_RATE_LIMITS, createServiceRequest, getTableCalls } from "./service-requests";
import { closeTable, listTables } from "./table-sessions";

const MESA = DEMO_TABLES.find((t) => t.orderingMode === "pay_later")!;
const CAMA = DEMO_TABLES.find((t) => t.orderingMode === "pay_first")!;

let db: Db;
let staff: StaffContext;
const now = new Date("2026-10-22T13:00:00Z");
beforeEach(async () => {
  db = await createTestDb();
  staff = (await resolveStaffContext(db, DEMO_USERS[2].userId))!;
});

const call = (token: string, body: unknown, ipHash = randomUUID()) => createServiceRequest(db, token, body, { ipHash, now });

describe("chamadas do cliente", () => {
  it("pedir a conta aparece no painel com o total por pagar e na mesa", async () => {
    const pos = new MockPosAdapter();
    await placeOrder(
      { tableToken: MESA.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D361", quantity: 2 }] },
      { clientIpHash: randomUUID() },
      { db, resolvePos: () => pos, now: () => now },
    );
    expect(await call(MESA.publicToken, { kind: "bill", detail: "card" })).toMatchObject({ ok: true, calls: [{ kind: "bill", detail: "card", acknowledged: false }] });

    const board = await getBoard(db, staff, now);
    expect(board.calls).toEqual([expect.objectContaining({ tableLabel: MESA.label, kind: "bill", detail: "card", dueCents: 500, acknowledged: false })]);
    const tables = await listTables(db, staff, now);
    expect(tables.find((t) => t.label === MESA.label)?.calls).toEqual(["bill"]);
  });

  it("carregar outra vez não duplica: só atualiza o detalhe", async () => {
    await call(MESA.publicToken, { kind: "bill", detail: "card" });
    await call(MESA.publicToken, { kind: "bill", detail: "cash" });
    await call(MESA.publicToken, { kind: "waiter", detail: "napkins" });
    const calls = (await getBoard(db, staff, now)).calls;
    expect(calls.map((c) => [c.kind, c.detail])).toEqual([
      ["bill", "cash"],
      ["waiter", "napkins"],
    ]);
  });

  it("nas camas (pagam ao pedir) não se pede a conta, mas pode chamar-se o empregado", async () => {
    expect(await call(CAMA.publicToken, { kind: "bill", detail: "card" })).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
    expect(await call(CAMA.publicToken, { kind: "waiter", detail: "clear" })).toMatchObject({ ok: true });
  });

  it("recusa pedidos inválidos e mesas que não existem", async () => {
    expect(await call(MESA.publicToken, { kind: "bill", detail: "bitcoin" })).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await call("x".repeat(22), { kind: "waiter", detail: "other" })).toMatchObject({ ok: false, code: "TABLE_NOT_FOUND" });
  });

  it("A caminho → o cliente vê; Feito → sai do painel", async () => {
    await call(MESA.publicToken, { kind: "waiter", detail: "order" });
    const [c] = (await getBoard(db, staff, now)).calls;
    expect(await actOnCall(db, staff, c.id, "ack", now)).toBe(true);
    expect(await getTableCalls(db, MESA.publicToken)).toEqual([{ kind: "waiter", detail: "order", acknowledged: true }]);
    expect(await actOnCall(db, staff, c.id, "done", now)).toBe(true);
    expect((await getBoard(db, staff, now)).calls).toEqual([]);
    expect(await actOnCall(db, staff, c.id, "done", now)).toBe(false);
  });

  it("fechar a mesa resolve as chamadas dela", async () => {
    const pos = new MockPosAdapter();
    await placeOrder(
      { tableToken: MESA.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D361", quantity: 1 }] },
      { clientIpHash: randomUUID() },
      { db, resolvePos: () => pos, now: () => now },
    );
    await call(MESA.publicToken, { kind: "bill", detail: "cash" });
    const table = (await listTables(db, staff, now)).find((t) => t.label === MESA.label)!;
    expect(await closeTable(db, staff, table.tableId, { now })).toMatchObject({ ok: true });
    expect(await getTableCalls(db, MESA.publicToken)).toEqual([]);
  });

  it("limita chamadas por mesa", async () => {
    for (let i = 0; i < CALL_RATE_LIMITS.perTable.limit; i++) await call(MESA.publicToken, { kind: "waiter", detail: "other" });
    expect(await call(MESA.publicToken, { kind: "waiter", detail: "other" })).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });
});
