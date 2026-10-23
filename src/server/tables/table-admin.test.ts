import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { getTableMenu } from "@/server/menu/get-table-menu";
import { applyTableAction, staffTableAction } from "./table-admin";

const T1 = DEMO_TABLES[0];
let db: Db;
let manager: StaffContext;
beforeEach(async () => {
  db = await createTestDb();
  manager = (await resolveStaffContext(db, DEMO_USERS[1].userId))!;
});

describe("QR Codes dos lugares (revisão 24/10)", () => {
  it("um QR novo invalida o antigo de imediato e regista quem o fez", async () => {
    expect(await getTableMenu(T1.publicToken, { db })).not.toBeNull();
    expect(await staffTableAction(db, manager, T1.id, "rotate_qr")).toBe(true);
    expect(await getTableMenu(T1.publicToken, { db })).toBeNull();
    const [row] = await db.select().from(t.diningTables).where(eq(t.diningTables.id, T1.id));
    expect(row.publicToken).not.toBe(T1.publicToken);
    expect(row.tokenRotatedAt).not.toBeNull();
    expect(await getTableMenu(row.publicToken, { db })).not.toBeNull();
    expect(await db.$count(t.auditLogs, eq(t.auditLogs.action, "table.rotate_qr"))).toBe(1);
  });

  it("um lugar desativado deixa de abrir a ementa; reativado volta", async () => {
    const actor = { organizationId: manager.organizationId, actorType: "admin" as const, actorId: "admin" };
    await db.transaction((tx) => applyTableAction(tx, actor, T1.id, "deactivate"));
    expect(await getTableMenu(T1.publicToken, { db })).toBeNull();
    await db.transaction((tx) => applyTableAction(tx, actor, T1.id, "activate"));
    expect(await getTableMenu(T1.publicToken, { db })).not.toBeNull();
  });

  it("não mexe em lugares de outro restaurante", async () => {
    const other = { ...manager, organizationId: "00000000-0000-4000-8000-00000000c001" };
    expect(await staffTableAction(db, other, T1.id, "rotate_qr")).toBe(false);
    const [row] = await db.select().from(t.diningTables).where(eq(t.diningTables.id, T1.id));
    expect(row.publicToken).toBe(T1.publicToken);
  });
});
