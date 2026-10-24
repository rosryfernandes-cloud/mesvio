import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_ESTABLISHMENT, DEMO_ORGANIZATION, DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder, type PlaceOrderDeps } from "@/server/orders/place-order";
import { resolveStaffContext } from "@/server/staff/context";
import { getTableBillByToken } from "@/server/tables/table-sessions";
import { MockPaymentProvider } from "./provider";
import { mapStatus, methodOf, StripePaymentProvider } from "./stripe-provider";
import { startOrderPayment } from "./order-payments";
import { refreshTablePayment, startTablePayment } from "./table-payments";
import { handleStripeEvent } from "./stripe-webhook";
import { refundOverpayment } from "./refunds";

const SUNBED = DEMO_TABLES.find((x) => x.label === "Cama 1")!;
const TABLE = DEMO_TABLES[0];
const ACCT = "acct_test_restaurante";
const WEBHOOK_SECRET = "whsec_test_mesvio";

/** Cliente Stripe falso: regista as chamadas e devolve PaymentIntents com o estado que o teste define. */
function fakeStripe() {
  const calls: { method: string; params: unknown; opts: unknown }[] = [];
  const intents = new Map<string, { status: Stripe.PaymentIntent.Status; amount: number }>();
  const byKey = new Map<string, string>();
  const stripe = {
    paymentIntents: {
      async create(params: Stripe.PaymentIntentCreateParams, opts: Stripe.RequestOptions) {
        calls.push({ method: "pi.create", params, opts });
        const existing = byKey.get(opts.idempotencyKey!);
        const id = existing ?? `pi_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
        if (!existing) {
          byKey.set(opts.idempotencyKey!, id);
          intents.set(id, { status: "requires_payment_method", amount: params.amount });
        }
        return { id, client_secret: `${id}_secret_x` };
      },
      async retrieve(id: string, _params: unknown, opts: Stripe.RequestOptions) {
        calls.push({ method: "pi.retrieve", params: id, opts });
        const pi = intents.get(id)!;
        return { id, status: pi.status, latest_charge: pi.status === "succeeded" ? { payment_method_details: { type: "card", card: { wallet: { type: "apple_pay" } } } } : null };
      },
      async cancel(id: string, _p: unknown, opts: Stripe.RequestOptions) {
        calls.push({ method: "pi.cancel", params: id, opts });
        const pi = intents.get(id)!;
        if (pi.status === "succeeded") throw new Stripe.errors.StripeInvalidRequestError({ type: "invalid_request_error", code: "payment_intent_unexpected_state", message: "x" });
        pi.status = "canceled";
        return { id };
      },
    },
    refunds: {
      async create(params: unknown, opts: unknown) {
        calls.push({ method: "refund.create", params, opts });
        return { id: "re_1" };
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, calls, intents };
}

let db: Db;
let deps: PlaceOrderDeps;
beforeEach(async () => {
  db = await createTestDb();
  deps = { db, resolvePos: () => new MockPosAdapter(), backoffMs: () => 0, paymentsAvailable: true };
});

const connect = () => db.update(t.establishments).set({ stripeAccountId: ACCT, paymentsEnabled: true }).where(eq(t.establishments.id, DEMO_ESTABLISHMENT.id));

async function sunbedOrder() {
  const r = await placeOrder(
    { tableToken: SUNBED.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "X524", quantity: 1, modifierRefs: ["GRP-MOJITO-3"] }] },
    { clientIpHash: randomUUID() },
    deps,
  );
  if (!r.ok) throw new Error(r.message);
  return r.order;
}

function signed(event: object): Stripe.Event {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return Stripe.webhooks.constructEvent(payload, header, WEBHOOK_SECRET);
}

describe("fornecedor Stripe", () => {
  it("cria o pagamento NA CONTA DO RESTAURANTE, em euros, com a comissão e chave idempotente", async () => {
    const { stripe, calls } = fakeStripe();
    const p = new StripePaymentProvider(stripe);
    const created = await p.create({ amountCents: 950, applicationFeeCents: 8, accountId: ACCT, idempotencyKey: "k1", description: "Cama 1", metadata: { orderId: "o1" } });
    expect(created.clientSecret).toMatch(/_secret_/);
    expect(calls[0]).toMatchObject({
      params: { amount: 950, currency: "eur", application_fee_amount: 8, automatic_payment_methods: { enabled: true, allow_redirects: "never" } },
      opts: { stripeAccount: ACCT, idempotencyKey: "k1" },
    });
    expect((calls[0].params as Stripe.PaymentIntentCreateParams).excluded_payment_method_types).toContain("multibanco");
  });

  it("sem conta ligada recusa cobrar (o dinheiro iria para a plataforma)", async () => {
    const p = new StripePaymentProvider(fakeStripe().stripe);
    await expect(p.create({ amountCents: 100, applicationFeeCents: 1, accountId: null, idempotencyKey: "k", description: "", metadata: {} })).rejects.toThrow();
  });

  it("uma tentativa recusada continua pendente (pode tentar de novo no mesmo formulário)", () => {
    expect(mapStatus("succeeded")).toBe("SUCCEEDED");
    expect(mapStatus("canceled")).toBe("CANCELLED");
    for (const s of ["requires_payment_method", "requires_action", "processing", "requires_confirmation"] as const) expect(mapStatus(s)).toBe("PENDING");
    expect(methodOf({ latest_charge: { payment_method_details: { type: "card", card: { wallet: { type: "apple_pay" } } } } } as unknown as Stripe.PaymentIntent)).toBe("apple_pay");
    expect(methodOf({ latest_charge: { payment_method_details: { type: "mb_way" } } } as unknown as Stripe.PaymentIntent)).toBe("mb_way");
  });

  it("cancelar um pagamento que acabou de ser pago devolve false (não é erro)", async () => {
    const { stripe, intents } = fakeStripe();
    const p = new StripePaymentProvider(stripe);
    const { providerRef } = await p.create({ amountCents: 100, applicationFeeCents: 1, accountId: ACCT, idempotencyKey: "k", description: "", metadata: {} });
    intents.get(providerRef)!.status = "succeeded";
    expect(await p.cancel(providerRef, ACCT)).toBe(false);
  });
});

describe("pagamentos com a Stripe", () => {
  it("restaurante sem conta Stripe: as espreguiçadeiras não cobram", async () => {
    const provider = new StripePaymentProvider(fakeStripe().stripe);
    const o = await sunbedOrder();
    expect(await startOrderPayment(db, SUNBED.publicToken, o.id, provider)).toMatchObject({ ok: false, code: "PAYMENTS_DISABLED" });
    expect(await startTablePayment(db, TABLE.publicToken, provider)).toMatchObject({ ok: false, code: "PAYMENTS_DISABLED" });
  });

  it("usa a comissão do cliente (regra no painel central), não 1% fixo", async () => {
    await connect();
    await db.insert(t.commissionRules).values({ organizationId: DEMO_ORGANIZATION.id, rateBps: 150, basis: "NET", effectiveFrom: "2026-01-01" });
    const { stripe, calls } = fakeStripe();
    const o = await sunbedOrder();
    const r = await startOrderPayment(db, SUNBED.publicToken, o.id, new StripePaymentProvider(stripe));
    expect(r).toMatchObject({ ok: true, accountId: ACCT, provider: "stripe" });
    const [row] = await db.select().from(t.orders).where(eq(t.orders.id, o.id));
    const fee = (calls[0].params as Stripe.PaymentIntentCreateParams).application_fee_amount!;
    expect(fee).toBe(Math.round((row.totalNetCents * 150) / 10_000));
  });

  it("webhook assinado: pagamento confirmado ativa o pedido uma só vez; outra conta ou evento repetido não fazem nada", async () => {
    await connect();
    const { stripe, intents } = fakeStripe();
    const provider = new StripePaymentProvider(stripe);
    const o = await sunbedOrder();
    const s = await startOrderPayment(db, SUNBED.publicToken, o.id, provider);
    if (!s.ok) throw new Error(s.message);
    const [pay] = await db.select().from(t.payments).where(eq(t.payments.id, s.paymentId));
    intents.get(pay.providerRef)!.status = "succeeded";
    const event = (account: string) => ({ id: `evt_${randomUUID()}`, object: "event", type: "payment_intent.succeeded", account, data: { object: { id: pay.providerRef, object: "payment_intent" } } });

    expect(await handleStripeEvent(db, signed(event("acct_outro")), provider)).toEqual({ handled: false, activatedOrderId: null });
    expect(await handleStripeEvent(db, signed(event(ACCT)), provider)).toEqual({ handled: true, activatedOrderId: o.id });
    expect(await handleStripeEvent(db, signed(event(ACCT)), provider)).toEqual({ handled: true, activatedOrderId: null });
    const [after] = await db.select().from(t.payments).where(eq(t.payments.id, s.paymentId));
    expect(after).toMatchObject({ status: "SUCCEEDED", method: "apple_pay" });
    const [ord] = await db.select().from(t.orders).where(eq(t.orders.id, o.id));
    expect(ord.status).toBe("RECEIVED");
  });

  it("assinatura errada é recusada antes de qualquer trabalho", () => {
    const payload = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_outro" });
    expect(() => Stripe.webhooks.constructEvent(payload, header, WEBHOOK_SECRET)).toThrow();
  });

  it("reembolso feito no dashboard da Stripe chega pelo webhook e baixa o 'já pago'", async () => {
    await connect();
    const { stripe, intents } = fakeStripe();
    const provider = new StripePaymentProvider(stripe);
    const o = await sunbedOrder();
    const s = await startOrderPayment(db, SUNBED.publicToken, o.id, provider);
    if (!s.ok) throw new Error(s.message);
    const [pay] = await db.select().from(t.payments).where(eq(t.payments.id, s.paymentId));
    intents.get(pay.providerRef)!.status = "succeeded";
    await refreshTablePayment(db, SUNBED.publicToken, s.paymentId, provider);
    expect((await getTableBillByToken(db, SUNBED.publicToken))!.paidCents).toBe(pay.amountCents);

    const refunded = { id: "evt_r", object: "event", type: "charge.refunded", account: ACCT, data: { object: { id: "ch_1", object: "charge", payment_intent: pay.providerRef, amount_refunded: 300 } } };
    expect((await handleStripeEvent(db, signed(refunded), provider)).handled).toBe(true);
    expect((await getTableBillByToken(db, SUNBED.publicToken))!.paidCents).toBe(pay.amountCents - 300);
  });
});

describe("devolver o pago a mais", () => {
  it("devolve só a diferença, uma vez, e a conta deixa de estar paga a mais", async () => {
    const provider = new MockPaymentProvider();
    await db.update(t.establishments).set({ paymentsEnabled: true }).where(eq(t.establishments.id, DEMO_ESTABLISHMENT.id));
    const r = await placeOrder(
      { tableToken: TABLE.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D361", quantity: 2 }] },
      { clientIpHash: "x" },
      deps,
    );
    if (!r.ok) throw new Error(r.message);
    const s = await startTablePayment(db, TABLE.publicToken, provider);
    if (!s.ok) throw new Error(s.message);
    const [first] = await db.select().from(t.payments).where(eq(t.payments.id, s.paymentId));
    provider.complete(first.providerRef, "apple_pay");
    await refreshTablePayment(db, TABLE.publicToken, s.paymentId, provider);
    // Outra pessoa pagou a mesma conta ao mesmo tempo (o fornecedor aceitou os dois).
    const second = await provider.create({ amountCents: first.amountCents, applicationFeeCents: 0, accountId: null, idempotencyKey: "dup", description: "", metadata: {} });
    provider.complete(second.providerRef, "mb_way");
    await db.insert(t.payments).values({ ...first, id: randomUUID(), providerRef: second.providerRef, status: "SUCCEEDED" });
    expect((await getTableBillByToken(db, TABLE.publicToken))!.overpaidCents).toBe(first.amountCents);

    const manager = (await resolveStaffContext(db, DEMO_USERS[1].userId))!;
    expect(await refundOverpayment(db, manager, TABLE.id, provider)).toEqual({ ok: true, refundedCents: first.amountCents });
    const bill = (await getTableBillByToken(db, TABLE.publicToken))!;
    expect(bill.overpaidCents).toBe(0);
    expect(bill.dueCents).toBe(0);
    expect(await refundOverpayment(db, manager, TABLE.id, provider)).toMatchObject({ ok: false, code: "NOTHING_TO_REFUND" });
  });
});
