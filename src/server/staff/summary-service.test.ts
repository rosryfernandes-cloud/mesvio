import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder, type PlaceOrderDeps } from "@/server/orders/place-order";
import { resolveStaffContext, type StaffContext } from "./context";
import { eq } from "drizzle-orm";
import { orders } from "@/server/db/schema";
import { setProductSoldOut } from "./staff-service";
import { getDaySummary, getWeekSummary } from "./summary-service";

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

describe("resumo da semana", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const backdate = async (id: string, daysAgo: number) => db.update(orders).set({ createdAt: new Date(Date.now() - daysAgo * DAY) }).where(eq(orders.id, id));

  it("sem pedidos: 7 dias a zero", async () => {
    const s = await getWeekSummary(db, owner);
    expect(s).toMatchObject({ orders: 0, salesCents: 0, previous: { orders: 0, salesCents: 0 }, topProducts: [], notOrdered: [], soldOutOften: [] });
    expect(s.byDay).toHaveLength(7);
    expect(s.byDay.every((d) => d.orders === 0)).toBe(true);
  });

  it("soma os últimos 7 dias por dia e compara com a semana anterior", async () => {
    const a = await order([{ productRef: "D361", quantity: 2 }]); // hoje, 5,00 €
    const b = await order([{ productRef: "D301", quantity: 1 }]); // há 3 dias, 2,75 €
    const c = await order([{ productRef: "D361", quantity: 1 }]); // há 9 dias: semana anterior
    const d = await order([{ productRef: "D361", quantity: 1 }]); // há 20 dias: fora
    for (const r of [a, b, c, d]) expect(r.ok).toBe(true);
    const id = (r: typeof a) => (r.ok ? r.order.id : "");
    await backdate(id(b), 3);
    await backdate(id(c), 9);
    await backdate(id(d), 20);

    const s = await getWeekSummary(db, owner);
    expect(s.orders).toBe(2);
    expect(s.salesCents).toBe(500 + 275);
    expect(s.previous).toEqual({ orders: 1, salesCents: 250 });
    expect(s.byDay).toHaveLength(7);
    expect(s.byDay[6]).toMatchObject({ orders: 1, salesCents: 500 });
    expect(s.byDay[3]).toMatchObject({ orders: 1, salesCents: 275 });
    expect(s.topProducts[0]).toEqual({ name: "Imperial 0,2 L", quantity: 2 });
  });

  it("avisa dos artigos que esgotaram 2 ou mais vezes na semana", async () => {
    await order([{ productRef: "D361", quantity: 1 }]);
    for (const soldOut of [true, false, true]) await setProductSoldOut(db, owner, "D361", soldOut);
    await setProductSoldOut(db, owner, "D301", true);
    const s = await getWeekSummary(db, owner);
    expect(s.soldOutOften).toEqual([{ name: "Imperial 0,2 L", times: 2 }]);
  });
});
