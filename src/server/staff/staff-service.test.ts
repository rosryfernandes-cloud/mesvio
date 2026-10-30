import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import { auditLogs, establishments, outbox } from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter, type MockPosOptions } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder, type PlaceOrderDeps } from "@/server/orders/place-order";
import { getOrderForTable } from "@/server/orders/order-view";
import { getTableMenu } from "@/server/menu/get-table-menu";
import { createDbTableDirectory } from "@/server/tables/table-directory";
import { applyStaffAction, getBoard, getStaffCatalog, setManualAcceptance, setProductSoldOut } from "./staff-service";
import { decodeSigned, encodeSigned } from "./session";
import { can, resolveStaffContext, type StaffContext } from "./context";
import { changeRole, inviteMember, listTeam, removeMember } from "./team-service";
import type { UserDirectory } from "@/server/auth/user-directory";

const TOKEN = DEMO_TABLES[0].publicToken;
const [OWNER, MANAGER, STAFF] = DEMO_USERS.map((u) => u.userId);

let db: Db;
let pos: MockPosAdapter;
let deps: PlaceOrderDeps;
let SESSION: StaffContext;
let ownerCtx: StaffContext;
let managerCtx: StaffContext;
beforeEach(async () => {
  db = await createTestDb();
  usePos();
  SESSION = (await resolveStaffContext(db, STAFF))!;
  ownerCtx = (await resolveStaffContext(db, OWNER))!;
  managerCtx = (await resolveStaffContext(db, MANAGER))!;
});

/** Diretório de teste: cada email novo recebe um id novo, sempre o mesmo para o mesmo email. */
const ids = new Map<string, string>();
const users: UserDirectory = {
  async ensureUser(email) {
    if (!ids.has(email)) ids.set(email, randomUUID());
    return { userId: ids.get(email)!, invited: true };
  },
};

function usePos(opts: MockPosOptions = {}) {
  pos = new MockPosAdapter(opts);
  deps = { db, resolvePos: () => pos, backoffMs: () => 0, maxAttempts: 1 };
}

const order = (lines = [{ productRef: "D361", quantity: 2 }]) =>
  placeOrder({ tableToken: TOKEN, idempotencyKey: randomUUID(), lines }, { clientIpHash: randomUUID() }, deps);

const statusOf = async (id: string) => (await getOrderForTable(db, TOKEN, id))?.status;

describe("contas e perfis", () => {
  it("cookie assinado: aceita o válido, rejeita adulterado ou expirado", () => {
    const exp = Date.now() + 3600_000;
    const v = encodeSigned({ u: STAFF }, exp);
    expect(decodeSigned(v)?.u).toBe(STAFF);
    const [, mac] = v.split(".");
    const forged = Buffer.from(JSON.stringify({ u: OWNER, x: exp })).toString("base64url");
    expect(decodeSigned(`${forged}.${mac}`)).toBeNull();
    expect(decodeSigned(v, exp + 1)).toBeNull();
    expect(decodeSigned("lixo")).toBeNull();
  });

  it("resolve o perfil e o restaurante de cada utilizador", () => {
    expect([ownerCtx.role, managerCtx.role, SESSION.role]).toEqual(["owner", "manager", "staff"]);
    expect(SESSION.establishmentName).toBe("Swara Beach ClubHouse");
    expect(SESSION.displayName).toBe("Carla (sala, demo)");
  });

  it("permissões por perfil", () => {
    expect(can(SESSION, "orders.act")).toBe(true);
    expect(can(SESSION, "catalog.sold_out")).toBe(true);
    expect(can(SESSION, "settings.edit")).toBe(false);
    expect(can(SESSION, "team.view")).toBe(false);
    expect(can(managerCtx, "settings.edit")).toBe(true);
    expect(can(managerCtx, "team.view")).toBe(true);
  });
});

describe("equipa", () => {
  it("o dono convida um gerente; a nova pessoa entra com o perfil certo", async () => {
    expect(await inviteMember(db, ownerCtx, { email: "novo@example.com", role: "manager" }, users)).toMatchObject({ ok: true });
    const ctx = await resolveStaffContext(db, ids.get("novo@example.com")!);
    expect(ctx?.role).toBe("manager");
    expect((await listTeam(db, ownerCtx)).map((m) => m.email)).toContain("novo@example.com");
  });

  it("o gerente só gere staff", async () => {
    expect(await inviteMember(db, managerCtx, { email: "x@example.com", role: "manager" }, users)).toMatchObject({ code: "FORBIDDEN" });
    expect(await inviteMember(db, managerCtx, { email: "y@example.com", role: "staff" }, users)).toMatchObject({ ok: true });
    const team = await listTeam(db, managerCtx);
    const owner = team.find((m) => m.role === "owner")!;
    expect(owner.manageable).toBe(false);
    expect(await removeMember(db, managerCtx, owner.membershipId)).toMatchObject({ code: "FORBIDDEN" });
    const carla = team.find((m) => m.userId === STAFF)!;
    expect(await changeRole(db, managerCtx, carla.membershipId, "manager")).toMatchObject({ code: "FORBIDDEN" });
    expect(await removeMember(db, managerCtx, carla.membershipId)).toEqual({ ok: true });
    expect(await resolveStaffContext(db, STAFF)).toBeNull(); // perdeu o acesso
  });

  it("não convida a mesma pessoa duas vezes", async () => {
    await inviteMember(db, ownerCtx, { email: "z@example.com", role: "staff" }, users);
    expect(await inviteMember(db, ownerCtx, { email: "z@example.com", role: "staff" }, users)).toMatchObject({ code: "CONFLICT" });
  });

  it("nunca fica sem dono, e ninguém se remove a si próprio", async () => {
    const team = await listTeam(db, ownerCtx);
    const me = team.find((m) => m.isYou)!;
    expect(await removeMember(db, ownerCtx, me.membershipId)).toMatchObject({ code: "FORBIDDEN" });
    // Um segundo dono tenta despromover o único outro dono → permitido; depois já não há como ficar sem dono.
    await inviteMember(db, ownerCtx, { email: "socio@example.com", role: "owner" }, users);
    const socio = (await resolveStaffContext(db, ids.get("socio@example.com")!))!;
    expect(await changeRole(db, socio, me.membershipId, "manager")).toEqual({ ok: true });
    const socioMembership = (await listTeam(db, socio)).find((m) => m.isYou)!;
    const anaNow = (await resolveStaffContext(db, OWNER))!;
    expect(anaNow.role).toBe("manager");
    expect(await removeMember(db, anaNow, socioMembership.membershipId)).toMatchObject({ code: "FORBIDDEN" });
  });

  it("regista quem fez cada alteração", async () => {
    await inviteMember(db, ownerCtx, { email: "w@example.com", role: "staff" }, users);
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "team.invite"));
    expect(log.actorId).toBe(OWNER);
  });
});

describe("quadro de pedidos", () => {
  it("mostra os pedidos do restaurante com linhas e mesa", async () => {
    const r = await order();
    const board = await getBoard(db, SESSION);
    expect(board.establishmentName).toBe("Swara Beach ClubHouse");
    expect(board.orders).toHaveLength(1);
    expect(board.orders[0]).toMatchObject({
      id: r.ok && r.order.id,
      tableLabel: "Mesa 1",
      status: "ACCEPTED",
      awaitingApproval: false,
      lines: [{ name: "Imperial 0,2 L", quantity: 2 }],
    });
  });

  it("não mostra pedidos de outro restaurante", async () => {
    await order();
    const otherOrg: StaffContext = { ...SESSION, organizationId: randomUUID() };
    await expect(getBoard(db, otherOrg)).rejects.toThrow(); // o RLS não deixa ver o restaurante
  });
});

describe("aprovação manual", () => {
  beforeEach(async () => {
    await setManualAcceptance(db, managerCtx, true);
  });

  it("o pedido espera pelo staff e não chega ao POS antes de aprovado", async () => {
    const r = await order();
    if (!r.ok) throw new Error(r.message);
    expect(r.order.status).toBe("RECEIVED");
    expect(await db.select().from(outbox)).toHaveLength(0);
    expect((await getBoard(db, SESSION)).orders[0].awaitingApproval).toBe(true);

    expect(await applyStaffAction(db, SESSION, r.order.id, "approve", deps)).toEqual({ ok: true });
    expect(await statusOf(r.order.id)).toBe("ACCEPTED");
    expect(pos.invoiceOrder(r.order.id).grossCents).toBe(500);
  });

  it("recusar cancela sem enviar ao POS", async () => {
    const r = await order();
    if (!r.ok) throw new Error(r.message);
    expect(await applyStaffAction(db, SESSION, r.order.id, "reject", deps)).toEqual({ ok: true });
    expect(await statusOf(r.order.id)).toBe("CANCELLED");
    expect(() => pos.invoiceOrder(r.order.id)).toThrow();
  });

  it("dois membros do staff a carregar ao mesmo tempo: só uma ação conta", async () => {
    const r = await order();
    if (!r.ok) throw new Error(r.message);
    const results = await Promise.all([
      applyStaffAction(db, SESSION, r.order.id, "approve", deps),
      applyStaffAction(db, SESSION, r.order.id, "reject", deps),
    ]);
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    expect(results.find((x) => !x.ok)).toMatchObject({ code: "CONFLICT" });
  });

  it("regista as ações no histórico de auditoria", async () => {
    const r = await order();
    if (!r.ok) throw new Error(r.message);
    await applyStaffAction(db, SESSION, r.order.id, "approve", deps);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, r.order.id));
    expect(logs.map((l) => [l.action, l.actorId])).toEqual([["order.approve", STAFF]]);
  });
});

describe("pedidos que precisam de atenção", () => {
  beforeEach(() => usePos({ transientFailuresPerOrder: 1 })); // falha a 1.ª tentativa; maxAttempts = 1

  it("tentar de novo envia ao POS", async () => {
    const r = await order();
    if (!r.ok) throw new Error(r.message);
    expect(r.order.status).toBe("NEEDS_ATTENTION");
    const board = await getBoard(db, SESSION);
    expect(board.orders[0].problem).toMatch(/falha transitória/);
    expect(await applyStaffAction(db, SESSION, r.order.id, "retry", { ...deps, maxAttempts: 3 })).toEqual({ ok: true });
    expect(await statusOf(r.order.id)).toBe("ACCEPTED");
  });

  it("'já lancei no POS' fecha o pedido sem o reenviar", async () => {
    const r = await order();
    if (!r.ok) throw new Error(r.message);
    expect(await applyStaffAction(db, SESSION, r.order.id, "handled", deps)).toEqual({ ok: true });
    expect(await statusOf(r.order.id)).toBe("ACCEPTED");
    expect(await applyStaffAction(db, SESSION, r.order.id, "retry", deps)).toMatchObject({ code: "CONFLICT" });
  });

  it("não deixa agir sobre pedidos de outro restaurante", async () => {
    const r = await order();
    if (!r.ok) throw new Error(r.message);
    const other: StaffContext = { ...SESSION, organizationId: randomUUID() };
    expect(await applyStaffAction(db, other, r.order.id, "handled", deps)).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("esgotados", () => {
  it("marcar esgotado tira o artigo da ementa e impede pedidos; repor volta a permitir", async () => {
    await setProductSoldOut(db, SESSION, "D361", true);
    const directory = createDbTableDirectory(db, () => pos);
    const menu = await getTableMenu(TOKEN, { db, directory });
    expect(menu?.categories.flatMap((c) => c.products).find((p) => p.ref === "D361")?.available).toBe(false);
    expect(await order()).toMatchObject({ ok: false, code: "INVALID_ITEMS" });

    const catalog = await getStaffCatalog(db, SESSION, () => pos);
    const imperial = catalog.flatMap((s) => s.categories).flatMap((c) => c.products).find((p) => p.ref === "D361");
    expect(imperial).toMatchObject({ posAvailable: true, locallyUnavailable: true });

    await setProductSoldOut(db, SESSION, "D361", false);
    expect((await order()).ok).toBe(true);
  });

  it("o painel não consegue repor um artigo que o POS dá como esgotado", async () => {
    pos.setAvailability("D361", false);
    await setProductSoldOut(db, SESSION, "D361", false);
    expect(await order()).toMatchObject({ ok: false, code: "INVALID_ITEMS" });
  });

  it("aprovação manual fica guardada no restaurante", async () => {
    await setManualAcceptance(db, managerCtx, true);
    const [e] = await db.select({ m: establishments.manualAcceptance }).from(establishments);
    expect(e.m).toBe(true);
  });
});
