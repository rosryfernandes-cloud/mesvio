import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import { establishments } from "@/server/db/schema";
import { DEMO_PLATFORM_ADMIN, DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { getTableMenu } from "@/server/menu/get-table-menu";
import { placeOrder } from "@/server/orders/place-order";
import { MockPaymentProvider } from "@/server/payments/provider";
import { startTablePayment } from "@/server/payments/table-payments";
import { resolveStaffContext } from "@/server/staff/context";
import { getPaymentsSetting } from "@/server/staff/staff-service";
import { createServiceRequest } from "@/server/tables/service-requests";
import { getTableBillByToken, listTables } from "@/server/tables/table-sessions";
import { findPlatformAdmin } from "./admin-auth";
import { getPlatformOverview, setPlan } from "./platform-service";

const MESA = DEMO_TABLES.find((t) => t.orderingMode === "pay_later")!;
const CAMA = DEMO_TABLES.find((t) => t.orderingMode === "pay_first")!;

let db: Db;
const pos = new MockPosAdapter();
beforeEach(async () => {
  db = await createTestDb();
});

const admin = async () => (await findPlatformAdmin(db, DEMO_PLATFORM_ADMIN.userId))!;
const staff = async () => (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
const establishmentId = async () => (await staff()).establishmentId;
const choose = async (plan: string) => setPlan(db, await admin(), await establishmentId(), plan);
const order = (table = MESA) =>
  placeOrder(
    { tableToken: table.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D361", quantity: 1 }] },
    { clientIpHash: randomUUID() },
    { db, resolvePos: () => pos, paymentsAvailable: true },
  );
const menu = (table = MESA) => getTableMenu(table.publicToken, { db, directory: undefined });

describe("planos por restaurante", () => {
  it("plano 1 (ementa): vê-se a ementa, mas não se pede nem se chama o empregado", async () => {
    expect(await choose("menu")).toMatchObject({ ok: true, plan: "menu" });
    const m = (await menu())!;
    expect(m.plan).toBe("menu");
    expect(m.ordering.enabled).toBe(false);
    expect(m.categories.length).toBeGreaterThan(0);
    expect(await order()).toMatchObject({ ok: false, code: "ORDERING_DISABLED" });
    expect(await createServiceRequest(db, MESA.publicToken, { kind: "waiter", detail: "order" }, { ipHash: "x" })).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
  });

  it("plano 2 (pedidos): pede-se e chama-se, mas não se paga no telemóvel; as camas pedem e pagam no restaurante", async () => {
    await db.update(establishments).set({ paymentsEnabled: true });
    await choose("orders");
    // Descer para um plano sem pagamentos desliga o interruptor.
    expect(await getPaymentsSetting(db, await staff())).toEqual({ enabled: false, planAllows: false });
    await db.update(establishments).set({ paymentsEnabled: true }); // mesmo que alguém o ligue à força

    expect(await order()).toMatchObject({ ok: true });
    expect(await createServiceRequest(db, MESA.publicToken, { kind: "bill", detail: "card" }, { ipHash: "x" })).toMatchObject({ ok: true });
    expect((await getTableBillByToken(db, MESA.publicToken))!.paymentsEnabled).toBe(false);
    expect(await startTablePayment(db, MESA.publicToken, new MockPaymentProvider())).toMatchObject({ ok: false, code: "PAYMENTS_DISABLED" });

    // Cama: deixa de "pagar ao pedir"; o pedido segue logo (sem ficar à espera de pagamento).
    expect((await menu(CAMA))!.table.orderingMode).toBe("pay_later");
    const cama = await order(CAMA);
    expect(cama).toMatchObject({ ok: true });
    expect((cama as { order: { status: string } }).order.status).not.toBe("AWAITING_PAYMENT");
    expect((await listTables(db, await staff())).find((t) => t.label === CAMA.label)!.orderingMode).toBe("pay_later");
  });

  it("plano 3 (pagamentos): tudo como antes — as camas pagam ao pedir e as mesas podem pagar a conta", async () => {
    await choose("payments");
    await db.update(establishments).set({ paymentsEnabled: true });
    expect((await menu(CAMA))!.table.orderingMode).toBe("pay_first");
    expect((await order(CAMA)) as { order: { status: string } }).toMatchObject({ order: { status: "AWAITING_PAYMENT" } });
    await order();
    expect((await getTableBillByToken(db, MESA.publicToken))!.paymentsEnabled).toBe(true);
  });

  it("o painel central mostra o plano e recusa planos que não existem", async () => {
    await choose("orders");
    const id = await establishmentId();
    expect((await getPlatformOverview(db)).establishments.find((e) => e.id === id)!.plan).toBe("orders");
    expect(await choose("gold")).toMatchObject({ ok: false, code: "INVALID" });
    const [row] = await db.select({ plan: establishments.plan }).from(establishments).where(eq(establishments.id, id));
    expect(row.plan).toBe("orders");
  });
});
