import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { pushSubscriptions } from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { assignTable, setAssignmentsEnabled } from "@/server/tables/assignments";
import { messageFor, notifyMe, notifyTableEvent, removeSubscription, saveSubscription, type PushSender } from "./push";

const T1 = DEMO_TABLES[0];
let db: Db;
let owner: StaffContext;
let staff: StaffContext;

beforeEach(async () => {
  db = await createTestDb();
  owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
  staff = (await resolveStaffContext(db, DEMO_USERS[2].userId))!;
});

const device = (name: string) => ({ endpoint: `https://push.example/${name}`, keys: { p256dh: `p256dh-key-${name}-xxxxxxxx`, auth: `auth-${name}-xx` } });

/** Serviço de push de mentira: regista quem recebeu; os aparelhos em `gone` já não existem (410). */
function fakeSender(gone: string[] = []) {
  const received: { endpoint: string; message: { title: string; body: string } }[] = [];
  const send: PushSender = async (sub, payload) => {
    if (gone.some((g) => sub.endpoint.endsWith(g))) throw Object.assign(new Error("gone"), { statusCode: 410 });
    received.push({ endpoint: sub.endpoint, message: JSON.parse(payload) });
    return { statusCode: 201 };
  };
  return { send, received };
}

const t1 = () => ({ organizationId: owner.organizationId, establishmentId: owner.establishmentId, tableId: T1.id });

describe("notificações da equipa (web push)", () => {
  it("textos claros para cada acontecimento", () => {
    expect(messageFor("Mesa 4", "x", { kind: "bill", detail: "card" }).body).toBe("Pediu a conta (cartão)");
    expect(messageFor("Mesa 4", "x", { kind: "waiter", detail: "napkins" }).body).toBe("Chamou o empregado (guardanapos)");
    expect(messageFor("Mesa 4", "x", { kind: "paid", amountCents: 2150 }).body).toMatch(/Pagou no telemóvel: 21,50/);
    expect(messageFor("Mesa 4", "x", { kind: "order", shortCode: "007", totalCents: 500 })).toMatchObject({ title: "Mesa 4", url: "/painel" });
  });

  it("sem responsável (ou mesas por empregado desligadas): vai para toda a equipa", async () => {
    await saveSubscription(db, owner, device("dona"));
    await saveSubscription(db, staff, device("carla"));
    const f = fakeSender();
    expect(await notifyTableEvent(db, t1(), { kind: "bill", detail: "cash" }, f.send)).toBe(2);
    expect(f.received[0].message).toMatchObject({ title: T1.label, body: "Pediu a conta (dinheiro)" });
  });

  it("mesa com responsável: só o telemóvel dele recebe", async () => {
    await saveSubscription(db, owner, device("dona"));
    await saveSubscription(db, staff, device("carla"));
    await setAssignmentsEnabled(db, owner, true);
    await assignTable(db, owner, T1.id, staff.userId);
    const f = fakeSender();
    expect(await notifyTableEvent(db, t1(), { kind: "waiter", detail: "order" }, f.send)).toBe(1);
    expect(f.received.map((r) => r.endpoint)).toEqual(["https://push.example/carla"]);
  });

  it("aparelhos que já não existem são apagados; o mesmo aparelho não fica duas vezes; desligar funciona", async () => {
    await saveSubscription(db, staff, device("carla"));
    await saveSubscription(db, staff, device("carla"));
    await saveSubscription(db, staff, device("antigo"));
    expect(await db.$count(pushSubscriptions)).toBe(2);

    const f = fakeSender(["antigo"]);
    expect(await notifyMe(db, staff, f.send)).toBe(1);
    expect(await db.$count(pushSubscriptions)).toBe(1);

    await removeSubscription(db, staff, "https://push.example/carla");
    expect(await db.$count(pushSubscriptions)).toBe(0);
    expect(await saveSubscription(db, staff, { endpoint: "não é url", keys: {} })).toBe(false);
  });

  it("sem chaves de notificação configuradas não envia nada", async () => {
    await saveSubscription(db, staff, device("carla"));
    expect(await notifyTableEvent(db, t1(), { kind: "bill", detail: "card" }, null)).toBe(0);
  });
});
