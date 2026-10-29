import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { createTestDb, type Db } from "@/server/db/client";
import { establishments } from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { applyPlanToSubscription, finishSubscriptionCheckout, getBillingStatus, startSubscriptionCheckout, syncAllSubscriptions } from "./subscriptions";

let db: Db;
let owner: StaffContext;
beforeEach(async () => {
  db = await createTestDb();
  owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
});

/** Stripe de mentira: clientes, Checkout e subscrições, com as chamadas registadas. */
function fakeStripe() {
  const calls: { op: string; args: unknown }[] = [];
  const subs = new Map<string, { id: string; status: string; metadata?: Record<string, string>; items: { data: { id: string; current_period_end: number; price: { product: string; unit_amount: number } }[] } }>();
  let sessionMeta: Record<string, string> = {};
  const stripe = {
    customers: {
      async create(args: unknown) {
        calls.push({ op: "customers.create", args });
        return { id: "cus_1" };
      },
    },
    checkout: {
      sessions: {
        async create(args: { metadata: Record<string, string> }) {
          calls.push({ op: "checkout.create", args });
          sessionMeta = args.metadata;
          return { id: "cs_1", url: "https://checkout.stripe.test/cs_1" };
        },
        async retrieve() {
          const sub = { id: "sub_1", status: "active", items: { data: [{ id: "si_1", current_period_end: 1_800_000_000, price: { product: "prod_1", unit_amount: 5900 } }] } };
          subs.set(sub.id, sub);
          return { id: "cs_1", metadata: sessionMeta, subscription: sub };
        },
      },
    },
    subscriptions: {
      async list() {
        return { data: [...subs.values()] };
      },
      async retrieve(id: string) {
        return subs.get(id)!;
      },
      async update(id: string, args: { items: { price_data: { unit_amount: number } }[] }) {
        calls.push({ op: "subscriptions.update", args });
        const s = subs.get(id)!;
        s.items.data[0].price.unit_amount = args.items[0].price_data.unit_amount;
        return s;
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, calls, subs, setMeta: (m: Record<string, string>) => (sessionMeta = m) };
}

describe("mensalidade MESVIO (Stripe Billing)", () => {
  it("ativar: cria o cliente uma vez e abre o Checkout com o valor do plano", async () => {
    const f = fakeStripe();
    const r = await startSubscriptionCheckout(db, owner, "https://mesvio.example", f.stripe);
    expect(r).toEqual({ ok: true, url: "https://checkout.stripe.test/cs_1" });
    const checkout = f.calls.find((c) => c.op === "checkout.create")!.args as Record<string, unknown>;
    expect(checkout).toMatchObject({
      mode: "subscription",
      customer: "cus_1",
      allowed_payment_method_types: ["card"],
      metadata: { establishmentId: owner.establishmentId },
      line_items: [{ price_data: { currency: "eur", unit_amount: 5900, recurring: { interval: "month" } } }],
    });
    await startSubscriptionCheckout(db, owner, "https://mesvio.example", f.stripe);
    expect(f.calls.filter((c) => c.op === "customers.create")).toHaveLength(1);
  });

  it("regresso: guarda a subscrição ativa; não aceita a sessão de outro restaurante", async () => {
    const f = fakeStripe();
    await startSubscriptionCheckout(db, owner, "https://x", f.stripe);
    expect(await finishSubscriptionCheckout(db, owner, "cs_1", f.stripe)).toBe(true);
    const status = await getBillingStatus(db, owner, f.stripe);
    expect(status).toMatchObject({ status: "active", active: true, monthlyCents: 5900 });
    expect(status.periodEnd).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(await startSubscriptionCheckout(db, owner, "https://x", f.stripe)).toMatchObject({ ok: false });

    f.setMeta({ establishmentId: "outro" });
    expect(await finishSubscriptionCheckout(db, owner, "cs_1", f.stripe)).toBe(false);
  });

  it("pagou mas o regresso falhou: o painel encontra a subscrição na Stripe", async () => {
    const f = fakeStripe();
    await startSubscriptionCheckout(db, owner, "https://x", f.stripe);
    expect(await getBillingStatus(db, owner, f.stripe)).toMatchObject({ status: null, active: false });
    f.subs.set("sub_9", { id: "sub_9", status: "active", metadata: { establishmentId: owner.establishmentId }, items: { data: [{ id: "si_9", current_period_end: 1_800_000_000, price: { product: "prod_1", unit_amount: 5900 } }] } });
    expect(await getBillingStatus(db, owner, f.stripe)).toMatchObject({ status: "active", active: true });
    const [e] = await db.select({ id: establishments.billingSubscriptionId }).from(establishments).where(eq(establishments.id, owner.establishmentId));
    expect(e.id).toBe("sub_9");
  });

  it("mudar de plano muda o valor da subscrição; sem subscrição não faz nada", async () => {
    const f = fakeStripe();
    expect(await applyPlanToSubscription(db, owner.establishmentId, "menu", f.stripe)).toBe("none");
    await startSubscriptionCheckout(db, owner, "https://x", f.stripe);
    await finishSubscriptionCheckout(db, owner, "cs_1", f.stripe);
    expect(await applyPlanToSubscription(db, owner.establishmentId, "menu", f.stripe)).toBe("updated");
    expect(f.calls.find((c) => c.op === "subscriptions.update")!.args).toMatchObject({
      items: [{ id: "si_1", price_data: { product: "prod_1", unit_amount: 2500 } }],
      proration_behavior: "create_prorations",
    });
  });

  it("a tarefa diária apanha cartões recusados", async () => {
    const f = fakeStripe();
    await startSubscriptionCheckout(db, owner, "https://x", f.stripe);
    await finishSubscriptionCheckout(db, owner, "cs_1", f.stripe);
    f.subs.get("sub_1")!.status = "past_due";
    expect(await syncAllSubscriptions(db, f.stripe)).toBe(1);
    const [e] = await db.select({ s: establishments.billingStatus }).from(establishments).where(eq(establishments.id, owner.establishmentId));
    expect(e.s).toBe("past_due");
  });
});
