import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder } from "@/server/orders/place-order";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { closeTable, listTables } from "./table-sessions";
import { assignTable, clearAssignments, recentClosures, setAssignmentsEnabled } from "./assignments";

const T1 = DEMO_TABLES[0];
let db: Db;
let owner: StaffContext;
let manager: StaffContext;
let staff: StaffContext;
const pos = new MockPosAdapter();

beforeEach(async () => {
  db = await createTestDb();
  owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
  manager = (await resolveStaffContext(db, DEMO_USERS[1].userId))!;
  staff = (await resolveStaffContext(db, DEMO_USERS[2].userId))!;
});

const order = () =>
  placeOrder(
    { tableToken: T1.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D361", quantity: 1 }] },
    { clientIpHash: randomUUID() },
    { db, resolvePos: () => pos },
  );

const assignedOf = async () => (await listTables(db, owner)).find((t) => t.tableId === T1.id)!.assignedUserId;

describe("mesas por empregado (em teste)", () => {
  it("desligado por defeito: fecha como antes e não se atribuem mesas", async () => {
    await order();
    expect(await assignTable(db, staff, T1.id, staff.userId)).toMatchObject({ ok: false, code: "DISABLED" });
    expect(await closeTable(db, staff, T1.id)).toMatchObject({ ok: true });
  });

  it("o empregado fica com mesas livres e larga as suas; o gerente atribui a quem quiser", async () => {
    await setAssignmentsEnabled(db, owner, true);
    expect(await assignTable(db, staff, T1.id, staff.userId)).toEqual({ ok: true });
    expect(await assignedOf()).toBe(staff.userId);
    expect(await assignTable(db, staff, T1.id, null)).toEqual({ ok: true });
    expect(await assignedOf()).toBeNull();

    expect(await assignTable(db, manager, T1.id, manager.userId)).toEqual({ ok: true });
    // A mesa já é de outra pessoa: o empregado não a pode tirar.
    expect(await assignTable(db, staff, T1.id, staff.userId)).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
    expect(await assignTable(db, staff, T1.id, null)).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
    expect(await assignTable(db, manager, T1.id, randomUUID())).toMatchObject({ ok: false, code: "NOT_ALLOWED" });

    expect(await clearAssignments(db, owner)).toBeGreaterThan(0);
    expect(await assignedOf()).toBeNull();
  });

  it("fechar a mesa de um colega pede confirmação; com valor em falta pede como foi pago; fica no histórico", async () => {
    await setAssignmentsEnabled(db, owner, true);
    await assignTable(db, manager, T1.id, manager.userId);
    await order();

    expect(await closeTable(db, staff, T1.id)).toMatchObject({ ok: false, code: "NOT_YOURS" });
    expect(await closeTable(db, staff, T1.id, { override: true })).toMatchObject({ ok: false, code: "PAID_WITH_REQUIRED", dueCents: 250 });
    expect(await closeTable(db, staff, T1.id, { override: true, paidWith: "cash" })).toMatchObject({ ok: true });

    const [closed] = await recentClosures(db, owner);
    expect(closed).toMatchObject({ tableLabel: T1.label, dueCents: 250, paidWith: "cash", notTheirs: true });
    expect(closed.closedBy).toContain("Carla");
  });

  it("o responsável e o gerente fecham as mesas sem a confirmação de colega", async () => {
    await setAssignmentsEnabled(db, owner, true);
    await assignTable(db, staff, T1.id, staff.userId);
    await order();
    expect(await closeTable(db, staff, T1.id, { paidWith: "card" })).toMatchObject({ ok: true });

    await order();
    // O gerente pode fechar a mesa de um empregado (fica registado como "mesa de outro empregado").
    expect(await closeTable(db, manager, T1.id, { paidWith: "other" })).toMatchObject({ ok: true });
    const closures = await recentClosures(db, owner);
    expect(closures.map((c) => [c.paidWith, c.notTheirs])).toEqual([
      ["other", true],
      ["card", false],
    ]);
  });
});
