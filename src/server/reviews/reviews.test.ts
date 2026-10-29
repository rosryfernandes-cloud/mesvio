import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { payments } from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder } from "@/server/orders/place-order";
import { MockPaymentProvider } from "@/server/payments/provider";
import { refreshTablePayment, startTablePayment } from "@/server/payments/table-payments";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { getTableBillByToken } from "@/server/tables/table-sessions";
import { getReviewsOverview, saveReviewSettings, submitReview } from "./reviews";

const T1 = DEMO_TABLES[0];
let db: Db;
let owner: StaffContext;
let provider: MockPaymentProvider;
const pos = new MockPosAdapter();

beforeEach(async () => {
  db = await createTestDb();
  owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
  provider = new MockPaymentProvider();
});

const order = () =>
  placeOrder(
    { tableToken: T1.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D361", quantity: 1 }] },
    { clientIpHash: randomUUID() },
    { db, resolvePos: () => pos },
  );

async function payBill() {
  const r = await startTablePayment(db, T1.publicToken, provider, new Date());
  if (!r.ok) throw new Error(r.message);
  const [row] = (await db.select().from(payments)).filter((p) => p.id === r.paymentId);
  provider.complete(row.providerRef, "mb_way", true);
  await refreshTablePayment(db, T1.publicToken, r.paymentId, provider);
}

const review = (body: unknown, ipHash = randomUUID()) => submitReview(db, T1.publicToken, body, { ipHash });

describe("avaliações no fim da conta (em teste)", () => {
  it("desligadas por defeito: a conta não as mostra e não se aceitam", async () => {
    await order();
    await payBill();
    expect((await getTableBillByToken(db, T1.publicToken))!.reviews).toEqual({ enabled: false, googleUrl: null });
    expect(await review({ stars: 5 })).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
  });

  it("ligadas: só depois de a conta estar paga; o painel vê a média, a distribuição e os comentários", async () => {
    expect(await saveReviewSettings(db, owner, { enabled: true, googleReviewUrl: "https://g.page/r/swara/review" })).toEqual({ ok: true });
    await order();
    expect(await review({ stars: 5 })).toMatchObject({ ok: false, code: "NOT_ALLOWED" }); // ainda por pagar
    await payBill();
    expect((await getTableBillByToken(db, T1.publicToken))!.reviews).toEqual({ enabled: true, googleUrl: "https://g.page/r/swara/review" });

    expect(await review({ stars: 5, comment: "  Ótimo serviço!  " })).toEqual({ ok: true });
    expect(await review({ stars: 2, comment: "Demorou muito" })).toEqual({ ok: true });
    const o = await getReviewsOverview(db, owner);
    expect(o).toMatchObject({ enabled: true, count: 2, average: 3.5, distribution: [0, 1, 0, 0, 1] });
    expect(o.recent.map((r) => r.comment).sort()).toEqual(["Demorou muito", "Ótimo serviço!"]);
    expect(o.recent[0].tableLabel).toBeTruthy();
  });

  it("valida as estrelas e trava quem envia avaliações sem fim", async () => {
    await saveReviewSettings(db, owner, { enabled: true });
    await order();
    await payBill();
    expect(await review({ stars: 0 })).toMatchObject({ code: "INVALID_INPUT" });
    expect(await review({ stars: 6 })).toMatchObject({ code: "INVALID_INPUT" });
    expect(await review({ stars: 4.5 })).toMatchObject({ code: "INVALID_INPUT" });
    for (let i = 0; i < 8; i++) expect(await review({ stars: 4 })).toEqual({ ok: true });
    expect(await review({ stars: 4 })).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("o link do Google tem de ser https e do Google", async () => {
    expect(await saveReviewSettings(db, owner, { enabled: true, googleReviewUrl: "http://g.page/r/x/review" })).toMatchObject({ ok: false });
    expect(await saveReviewSettings(db, owner, { enabled: true, googleReviewUrl: "https://exemplo.pt/review" })).toMatchObject({ ok: false });
    expect(await saveReviewSettings(db, owner, { enabled: true, googleReviewUrl: "https://search.google.com/local/writereview?placeid=abc" })).toEqual({ ok: true });
    expect(await saveReviewSettings(db, owner, { enabled: false, googleReviewUrl: "" })).toEqual({ ok: true });
    expect(await getReviewsOverview(db, owner)).toMatchObject({ enabled: false, googleReviewUrl: null });
  });
});
