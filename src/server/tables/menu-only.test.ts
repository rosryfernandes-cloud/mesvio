import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import { diningTables } from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder } from "@/server/orders/place-order";
import { getTableMenu } from "@/server/menu/get-table-menu";
import { createDbTableDirectory } from "./table-directory";
import { createServiceRequest } from "./service-requests";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe('lugares "só ementa" (ex.: a sala, com pedidos só nas camas)', () => {
  it("mostram a ementa sem pedir, recusam pedidos do cliente, deixam chamar o empregado e aceitam pedidos da comandeira", async () => {
    const table = DEMO_TABLES.find((t) => t.orderingMode === "pay_later")!;
    await db.update(diningTables).set({ orderingMode: "menu_only" }).where(eq(diningTables.publicToken, table.publicToken));
    const pos = new MockPosAdapter();

    const menu = await getTableMenu(table.publicToken, { db, directory: createDbTableDirectory(db, () => pos) });
    expect(menu?.table.orderingMode).toBe("menu_only");
    expect(menu?.ordering.enabled).toBe(false);
    expect(menu?.categories.length).toBeGreaterThan(0);

    const order = (byStaff?: { userId: string; name: string }) =>
      placeOrder(
        { tableToken: table.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D361", quantity: 1 }] },
        { clientIpHash: randomUUID() },
        { db, resolvePos: () => pos, backoffMs: () => 0, byStaff },
      );
    const fromClient = await order();
    expect(fromClient.ok).toBe(false);
    if (!fromClient.ok) expect(fromClient.code).toBe("ORDERING_DISABLED");
    expect((await order({ userId: DEMO_USERS[0].userId, name: "Ana" })).ok).toBe(true);

    const waiter = await createServiceRequest(db, table.publicToken, { kind: "waiter", detail: "order" }, { ipHash: randomUUID() });
    expect(waiter).toMatchObject({ ok: true });
    const bill = await createServiceRequest(db, table.publicToken, { kind: "bill", detail: "card" }, { ipHash: randomUUID() });
    expect(bill.ok).toBe(false);
  });
});

describe("retirar um lugar na Central", () => {
  it("o QR deixa de abrir a ementa e volta a abrir quando o lugar é reposto", async () => {
    const { setTableActive } = await import("@/server/platform/platform-service");
    const { DEMO_ESTABLISHMENT } = await import("@/server/pos/mock/demo-data");
    const { findPlatformAdmin } = await import("@/server/platform/admin-auth");
    const { DEMO_PLATFORM_ADMIN } = await import("@/server/db/seed-demo");
    const table = DEMO_TABLES[0];
    const [row] = await db.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.publicToken, table.publicToken));
    const admin = (await findPlatformAdmin(db, DEMO_PLATFORM_ADMIN.userId))!;
    const pos = new MockPosAdapter();
    const open = () => getTableMenu(table.publicToken, { db, directory: createDbTableDirectory(db, () => pos) });
    expect(await open()).not.toBeNull();
    expect((await setTableActive(db, admin, DEMO_ESTABLISHMENT.id, row.id, false)).ok).toBe(true);
    expect(await open()).toBeNull();
    expect((await setTableActive(db, admin, DEMO_ESTABLISHMENT.id, row.id, true)).ok).toBe(true);
    expect(await open()).not.toBeNull();
  });
});

describe("editar um lugar na Central", () => {
  it("muda o nome, a zona e o tipo sem mudar o QR, e recusa um nome vazio", async () => {
    const { updateTable } = await import("@/server/platform/platform-service");
    const { DEMO_ESTABLISHMENT } = await import("@/server/pos/mock/demo-data");
    const { findPlatformAdmin } = await import("@/server/platform/admin-auth");
    const { DEMO_PLATFORM_ADMIN } = await import("@/server/db/seed-demo");
    const admin = (await findPlatformAdmin(db, DEMO_PLATFORM_ADMIN.userId))!;
    const table = DEMO_TABLES.find((t) => t.orderingMode === "pay_later")!;
    const [row] = await db.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.publicToken, table.publicToken));
    const r = await updateTable(db, admin, DEMO_ESTABLISHMENT.id, row.id, { label: "Mesa 1 Sala", zone: "Sala", orderingMode: "menu_only" });
    expect(r).toMatchObject({ ok: true, label: "Mesa 1 Sala", zone: "Sala", orderingMode: "menu_only", active: true });
    const [after] = await db.select().from(diningTables).where(eq(diningTables.id, row.id));
    expect(after.publicToken).toBe(table.publicToken);
    expect((await updateTable(db, admin, DEMO_ESTABLISHMENT.id, row.id, { label: "  " })).ok).toBe(false);
    expect((await updateTable(db, admin, DEMO_ESTABLISHMENT.id, row.id, {})).ok).toBe(false);
  });
});
