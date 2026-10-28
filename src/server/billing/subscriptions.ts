import "server-only";
import type Stripe from "stripe";
import { eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { auditLogs, establishments } from "@/server/db/schema";
import { PLAN_LABEL, PLAN_MONTHLY_CENTS, type Plan } from "@/lib/plan";
import type { StaffContext } from "@/server/staff/context";

/**
 * Mensalidade da MESVIO (subscrição Stripe Billing na conta da plataforma, não na do restaurante).
 * O dono ativa-a no painel (Stripe Checkout, cartão do restaurante debitado todos os meses); o
 * estado volta a ler-se da Stripe quando o painel abre e na tarefa diária, por isso não depende de
 * um webhook próprio. Mudar de plano no painel central muda o valor da subscrição.
 */
type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

const PRODUCT_NAME = "Subscrição MESVIO";

export interface BillingStatus {
  plan: Plan;
  planLabel: string;
  monthlyCents: number;
  /** null = ainda sem subscrição. */
  status: string | null;
  /** Subscrição em dia (ativa ou em período de experiência). */
  active: boolean;
  periodEnd: string | null;
}

const isActive = (status: string | null) => status === "active" || status === "trialing";

function priceData(plan: Plan, product: string): Stripe.SubscriptionItemUpdateParams.PriceData {
  return { currency: "eur", product, unit_amount: PLAN_MONTHLY_CENTS[plan], recurring: { interval: "month" } };
}

function periodEndOf(sub: Stripe.Subscription): Date | null {
  const end = sub.items.data[0]?.current_period_end;
  return end ? new Date(end * 1000) : null;
}

async function row(db: Db, s: Scope) {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [e] = await tx
      .select({
        name: establishments.name,
        plan: establishments.plan,
        customerId: establishments.billingCustomerId,
        subscriptionId: establishments.billingSubscriptionId,
        status: establishments.billingStatus,
        periodEnd: establishments.billingPeriodEnd,
      })
      .from(establishments)
      .where(eq(establishments.id, s.establishmentId));
    return e;
  });
}

async function save(db: Db, establishmentId: string, values: Partial<typeof establishments.$inferInsert>) {
  await db.update(establishments).set({ ...values, updatedAt: new Date() }).where(eq(establishments.id, establishmentId));
}

/** Guarda o estado atual de uma subscrição (ligação de sistema). */
async function store(db: Db, establishmentId: string, sub: Stripe.Subscription) {
  await save(db, establishmentId, { billingSubscriptionId: sub.id, billingStatus: sub.status, billingPeriodEnd: periodEndOf(sub) });
}

/** Estado da mensalidade para o painel do restaurante (lê de novo da Stripe, se houver subscrição). */
export async function getBillingStatus(systemDb: Db, s: Scope, stripe: Stripe | null): Promise<BillingStatus> {
  const e = await row(systemDb, s);
  let status = e.status;
  let periodEnd = e.periodEnd;
  if (stripe && e.subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(e.subscriptionId).catch(() => null);
    if (sub) {
      await store(systemDb, s.establishmentId, sub);
      status = sub.status;
      periodEnd = periodEndOf(sub);
    }
  }
  return {
    plan: e.plan,
    planLabel: PLAN_LABEL[e.plan],
    monthlyCents: PLAN_MONTHLY_CENTS[e.plan],
    status,
    active: isActive(status),
    periodEnd: periodEnd?.toISOString() ?? null,
  };
}

/** Abre o Stripe Checkout para o dono ativar a mensalidade do plano atual. Devolve o link. */
export async function startSubscriptionCheckout(
  systemDb: Db,
  s: Scope & { email?: string | null },
  baseUrl: string,
  stripe: Stripe,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const e = await row(systemDb, s);
  if (isActive(e.status)) return { ok: false, message: "A subscrição já está ativa." };
  let customerId = e.customerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: e.name,
      email: s.email ?? undefined,
      metadata: { establishmentId: s.establishmentId, organizationId: s.organizationId },
    });
    customerId = customer.id;
    await save(systemDb, s.establishmentId, { billingCustomerId: customerId });
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: PLAN_MONTHLY_CENTS[e.plan],
          recurring: { interval: "month" },
          product_data: { name: PRODUCT_NAME, description: `Plano ${PLAN_LABEL[e.plan]}` },
        },
      },
    ],
    metadata: { establishmentId: s.establishmentId },
    subscription_data: { metadata: { establishmentId: s.establishmentId } },
    success_url: `${baseUrl}/painel/subscricao/retorno?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/painel?subscricao=cancelada`,
  });
  if (!session.url) return { ok: false, message: "A Stripe não devolveu o link de pagamento." };
  return { ok: true, url: session.url };
}

/** Regresso do Checkout: confirma que a sessão é deste restaurante e guarda a subscrição. */
export async function finishSubscriptionCheckout(systemDb: Db, s: Scope, sessionId: string, stripe: Stripe): Promise<boolean> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  if (session.metadata?.establishmentId !== s.establishmentId) return false;
  const sub = session.subscription;
  if (!sub || typeof sub === "string") return false;
  await store(systemDb, s.establishmentId, sub);
  await systemDb.insert(auditLogs).values({
    organizationId: s.organizationId,
    actorType: "user",
    actorId: s.userId,
    action: "billing.subscription_started",
    entityType: "establishment",
    entityId: s.establishmentId,
    after: { subscriptionId: sub.id, status: sub.status },
  });
  return isActive(sub.status);
}

/** Portal da Stripe para o dono mudar o cartão, ver faturas ou cancelar. */
export async function billingPortalUrl(systemDb: Db, s: Scope, returnUrl: string, stripe: Stripe): Promise<string | null> {
  const e = await row(systemDb, s);
  if (!e.customerId) return null;
  const portal = await stripe.billingPortal.sessions.create({ customer: e.customerId, return_url: returnUrl });
  return portal.url;
}

/**
 * Mudou o plano (painel central): a subscrição passa a cobrar o valor do novo plano, com acerto
 * proporcional no mês corrente. Sem subscrição não faz nada.
 */
export async function applyPlanToSubscription(systemDb: Db, establishmentId: string, plan: Plan, stripe: Stripe | null): Promise<"updated" | "none"> {
  const [e] = await systemDb.select({ subscriptionId: establishments.billingSubscriptionId }).from(establishments).where(eq(establishments.id, establishmentId));
  if (!stripe || !e?.subscriptionId) return "none";
  const sub = await stripe.subscriptions.retrieve(e.subscriptionId);
  if (sub.status === "canceled" || sub.status === "incomplete_expired") return "none";
  const item = sub.items.data[0];
  const product = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
  const updated = await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, price_data: priceData(plan, product) }],
    proration_behavior: "create_prorations",
    metadata: { establishmentId, plan },
  });
  await store(systemDb, establishmentId, updated);
  return "updated";
}

/** Tarefa diária: põe em dia o estado de todas as subscrições (pagamentos falhados, cancelamentos). */
export async function syncAllSubscriptions(systemDb: Db, stripe: Stripe): Promise<number> {
  const rows = await systemDb
    .select({ id: establishments.id, subscriptionId: establishments.billingSubscriptionId })
    .from(establishments)
    .where(isNotNull(establishments.billingSubscriptionId));
  let n = 0;
  for (const r of rows) {
    const sub = await stripe.subscriptions.retrieve(r.subscriptionId!).catch(() => null);
    if (sub) {
      await store(systemDb, r.id, sub);
      n++;
    }
  }
  return n;
}
