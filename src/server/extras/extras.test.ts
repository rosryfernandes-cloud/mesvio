import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import { orderEvents, orders } from "@/server/db/schema";
import { DEMO_ESTABLISHMENT, DEMO_ORGANIZATION, DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder } from "@/server/orders/place-order";
import { applyStaffAction } from "@/server/staff/staff-service";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { getExtras, regenerateLink, resolveExtraLink, setExtra } from "./extras-service";

const ORG = DEMO_ORGANIZATION.id, EST = DEMO_ESTABLISHMENT.id;
let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("extras", () => {
  it("começam desligados; ligar a TV cria o link, desligar fecha-o e trocar invalida o antigo", async () => {
    expect((await getExtras(db, ORG, EST)).enabled).toEqual([]);
    const on = await setExtra(db, ORG, EST, "tv", true);
    expect(on.enabled).toContain("tv");
    expect(on.tvToken).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(await resolveExtraLink(db, "tv", on.tvToken!)).toEqual({ organizationId: ORG, establishmentId: EST });
    expect(await resolveExtraLink(db, "site", on.tvToken!)).toBeNull(); // o link da TV não abre o site
    const again = await regenerateLink(db, ORG, EST, "tv");
    expect(await resolveExtraLink(db, "tv", on.tvToken!)).toBeNull();
    expect(await resolveExtraLink(db, "tv", again.tvToken!)).not.toBeNull();
    await setExtra(db, ORG, EST, "tv", false);
    expect(await resolveExtraLink(db, "tv", again.tvToken!)).toBeNull();
  });
});

describe("comandeira e ecrã da cozinha", () => {
  it("o pedido do empregado numa cama (pagar ao pedir) segue logo para a cozinha, fica como pedido da equipa, e a cozinha marca pronto", async () => {
    const bed = DEMO_TABLES.find((t) => t.orderingMode === "pay_first")!;
    const pos = new MockPosAdapter();
    const r = await placeOrder(
      { tableToken: bed.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D361", quantity: 2 }] },
      { clientIpHash: "staff:teste" },
      { db, resolvePos: () => pos, backoffMs: () => 0, byStaff: { userId: DEMO_USERS[0].userId, name: "Ana" } },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [o] = await db.select().from(orders).where(eq(orders.id, r.order.id));
    expect(o.status).not.toBe("AWAITING_PAYMENT");
    const [ev] = await db.select().from(orderEvents).where(eq(orderEvents.orderId, o.id));
    expect(ev.source).toBe("staff");
    // Aceite pelo POS (MockPOS) → "Pronto" no ecrã da cozinha passa a servido.
    await db.update(orders).set({ status: "ACCEPTED" }).where(eq(orders.id, o.id));
    const scope = { userId: DEMO_USERS[0].userId, organizationId: ORG, establishmentId: EST };
    expect(await applyStaffAction(db, scope, o.id, "ready")).toEqual({ ok: true });
    const [after] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, o.id));
    expect(after.status).toBe("SERVED");
  });
});
