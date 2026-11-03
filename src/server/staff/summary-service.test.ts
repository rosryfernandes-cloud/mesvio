import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder, type PlaceOrderDeps } from "@/server/orders/place-order";
import { resolveStaffContext, type StaffContext } from "./context";
import { getDaySummary } from "./summary-service";

const TOKEN = DEMO_TABLES[0].publicToken;
const OWNER = DEMO_USERS[0].userId;

let db: Db;
let deps: PlaceOrderDeps;
let owner: StaffContext;
beforeEach(async () => {
  db = await createTestDb();
  deps = { db, resolvePos: () => new MockPosAdapter(), backoffMs: () => 0, maxAttempts: 1 };
  owner = (await resolveStaffContext(db, OWNER))!;
});

const order = (lines: { productRef: string; quantity: number }[]) =>
  placeOrder({ tableToken: TOKEN, idempotencyKey: randomUUID(), lines }, { clientIpHash: randomUUID() }, deps);

describe("resumo do dia", () => {
  it("sem pedidos: tudo a zero", async () => {
    expect(await getDaySummary(db, owner)).toEqual({ orders: 0, salesCents: 0, averageTicketCents: 0, secondsToKitchen: null, byHour: [], topProducts: [] });
  });

  it("conta pedidos, vendas, ticket médio, horas e os mais pedidos", async () => {
    await order([{ productRef: "D361", quantity: 2 }]); // 2 × 2,50 €
    await order([{ productRef: "D361", quantity: 1 }, { productRef: "D301", quantity: 1 }]); // 2,50 € + 2,75 €
    const s = await getDaySummary(db, owner);
    expect(s.orders).toBe(2);
    expect(s.salesCents).toBe(500 + 525);
    expect(s.averageTicketCents).toBe(513);
    expect(s.byHour.reduce((n, h) => n + h.orders, 0)).toBe(2);
    expect(s.topProducts[0]).toEqual({ name: "Imperial 0,2 L", quantity: 3 });
    expect(s.secondsToKitchen).not.toBeNull();
  });
});
