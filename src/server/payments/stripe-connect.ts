import "server-only";
import type Stripe from "stripe";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { auditLogs, establishments } from "@/server/db/schema";
import type { StaffContext } from "@/server/staff/context";
import { stripeClient } from "./stripe-provider";

/**
 * Ligar a conta Stripe de um restaurante (Stripe Connect). Conta com dashboard Stripe completo:
 * o restaurante é o comerciante, paga as comissões da Stripe, recebe diretamente no IBAN dele e
 * a Stripe recolhe e verifica os dados (KYC) no formulário dela. A MESVIO só guarda o acct_….
 */
type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

export interface ConnectStatus {
  /** Stripe configurada neste servidor (STRIPE_SECRET_KEY). */
  available: boolean;
  accountId: string | null;
  /** Pode cobrar (verificação da Stripe concluída). */
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  /** Dados que a Stripe ainda pede ao restaurante. */
  requirementsDue: number;
  /** Apple Pay neste site (só quando se pediu com o domínio e a conta já cobra). */
  applePay?: ApplePayStatus | "error";
}

async function storedAccount(db: Db, s: Scope): Promise<{ accountId: string | null; name: string }> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [e] = await tx.select({ accountId: establishments.stripeAccountId, name: establishments.name }).from(establishments).where(eq(establishments.id, s.establishmentId));
    return { accountId: e?.accountId ?? null, name: e?.name ?? "" };
  });
}

export async function getConnectStatus(
  db: Db,
  s: Scope,
  stripe: Stripe | null = process.env.STRIPE_SECRET_KEY ? stripeClient() : null,
  { domain }: { domain?: string } = {},
): Promise<ConnectStatus> {
  const { accountId } = await storedAccount(db, s);
  if (!stripe) return { available: false, accountId, chargesEnabled: false, detailsSubmitted: false, requirementsDue: 0 };
  if (!accountId) return { available: true, accountId: null, chargesEnabled: false, detailsSubmitted: false, requirementsDue: 0 };
  const account = await stripe.accounts.retrieve(accountId);
  let applePay: ConnectStatus["applePay"];
  // Sempre que o painel vê a conta pronta: garantir o domínio do Apple Pay (a conta pode ter ficado
  // aprovada depois do regresso do formulário, e aí o domínio nunca chegou a ser registado).
  if (domain && account.charges_enabled) {
    applePay = await ensureApplePayDomain(stripe, accountId, domain).catch((err) => {
      console.warn("[stripe] domínio do Apple Pay:", err instanceof Error ? err.message : err);
      return "error" as const;
    });
  }
  return {
    available: true,
    accountId,
    chargesEnabled: account.charges_enabled,
    detailsSubmitted: account.details_submitted,
    requirementsDue: account.requirements?.currently_due?.length ?? 0,
    applePay,
  };
}

/**
 * Cria (uma vez) a conta ligada do restaurante e devolve o link do formulário da Stripe.
 * A conta fica gravada antes de o dono terminar: se sair a meio, o próximo link continua a mesma.
 */
export async function startOnboarding(db: Db, s: Scope, baseUrl: string, stripe: Stripe = stripeClient()): Promise<string> {
  let { accountId, name } = await storedAccount(db, s);
  if (!accountId) {
    // Accounts v2: a Stripe já não deixa contas Stripe novas criarem contas ligadas pela API v1.
    // Conta com o dashboard Stripe completo; o restaurante é o comerciante (cobranças diretas),
    // paga as comissões da Stripe e assume as perdas (disputas) — como antes.
    const account = await stripe.v2.core.accounts.create(
      {
        display_name: name,
        dashboard: "full",
        identity: { country: "pt" },
        defaults: { currency: "eur", responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
        configuration: { merchant: { mcc: "5812", capabilities: { card_payments: { requested: true } } } }, // 5812: restaurantes
        metadata: { establishmentId: s.establishmentId, organizationId: s.organizationId },
      },
      // Dois cliques seguidos não criam duas contas.
      { idempotencyKey: `mesvio-acct-v2:${s.establishmentId}` },
    );
    accountId = await withTenant(db, tenantOf(s), async (tx) => {
      const [saved] = await tx
        .update(establishments)
        .set({ stripeAccountId: account.id, updatedAt: new Date() })
        .where(and(eq(establishments.id, s.establishmentId), isNull(establishments.stripeAccountId)))
        .returning({ id: establishments.stripeAccountId });
      await tx.insert(auditLogs).values({
        organizationId: s.organizationId,
        actorType: "user",
        actorId: s.userId,
        action: "payments.stripe_account_created",
        entityType: "establishment",
        entityId: s.establishmentId,
        after: { accountId: account.id },
      });
      if (saved) return saved.id!;
      const [e] = await tx.select({ id: establishments.stripeAccountId }).from(establishments).where(eq(establishments.id, s.establishmentId));
      return e!.id!;
    });
  }
  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: { refresh_url: `${baseUrl}/painel/stripe/ligar`, return_url: `${baseUrl}/painel/stripe/retorno` },
    },
  });
  return link.url;
}

export type ApplePayStatus = "active" | "inactive" | "pending" | "local";

/**
 * O Apple Pay só aparece na ementa se o domínio da MESVIO estiver registado na conta do restaurante
 * (e ativo). Regista-o se faltar, liga-o se estiver desligado e, se a Apple o tiver recusado,
 * pede nova validação. Repetir não faz mal. Devolve o estado do Apple Pay nesse domínio.
 */
export async function ensureApplePayDomain(stripe: Stripe, accountId: string, domain: string): Promise<ApplePayStatus> {
  if (/^(localhost|127\.|\[::1\])/.test(domain) || domain.endsWith(".localhost")) return "local";
  const opts = { stripeAccount: accountId };
  const existing = (await stripe.paymentMethodDomains.list({ domain_name: domain, limit: 1 }, opts)).data[0];
  let d = existing ?? (await stripe.paymentMethodDomains.create({ domain_name: domain, enabled: true }, opts));
  if (!d.enabled) d = await stripe.paymentMethodDomains.update(d.id, { enabled: true }, opts);
  if (d.apple_pay?.status === "inactive") d = await stripe.paymentMethodDomains.validate(d.id, {}, opts);
  return d.apple_pay?.status === "active" ? "active" : d.apple_pay?.status === "inactive" ? "inactive" : "pending";
}

/** Regressa do formulário: confirma o estado e, se a conta já pode cobrar, prepara o Apple Pay. */
export async function finishOnboarding(db: Db, s: Scope, domain: string, stripe: Stripe = stripeClient()): Promise<ConnectStatus> {
  return getConnectStatus(db, s, stripe, { domain });
}
