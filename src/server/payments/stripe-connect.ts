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
}

async function storedAccount(db: Db, s: Scope): Promise<{ accountId: string | null; name: string }> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [e] = await tx.select({ accountId: establishments.stripeAccountId, name: establishments.name }).from(establishments).where(eq(establishments.id, s.establishmentId));
    return { accountId: e?.accountId ?? null, name: e?.name ?? "" };
  });
}

export async function getConnectStatus(db: Db, s: Scope, stripe: Stripe | null = process.env.STRIPE_SECRET_KEY ? stripeClient() : null): Promise<ConnectStatus> {
  const { accountId } = await storedAccount(db, s);
  if (!stripe) return { available: false, accountId, chargesEnabled: false, detailsSubmitted: false, requirementsDue: 0 };
  if (!accountId) return { available: true, accountId: null, chargesEnabled: false, detailsSubmitted: false, requirementsDue: 0 };
  const account = await stripe.accounts.retrieve(accountId);
  return {
    available: true,
    accountId,
    chargesEnabled: account.charges_enabled,
    detailsSubmitted: account.details_submitted,
    requirementsDue: account.requirements?.currently_due?.length ?? 0,
  };
}

/**
 * Cria (uma vez) a conta ligada do restaurante e devolve o link do formulário da Stripe.
 * A conta fica gravada antes de o dono terminar: se sair a meio, o próximo link continua a mesma.
 */
export async function startOnboarding(db: Db, s: Scope, baseUrl: string, stripe: Stripe = stripeClient()): Promise<string> {
  let { accountId, name } = await storedAccount(db, s);
  if (!accountId) {
    const account = await stripe.accounts.create(
      {
        country: "PT",
        business_profile: { name, mcc: "5812" }, // 5812: restaurantes
        controller: {
          stripe_dashboard: { type: "full" },
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          requirement_collection: "stripe",
        },
        capabilities: { card_payments: { requested: true }, mb_way_payments: { requested: true } },
        metadata: { establishmentId: s.establishmentId, organizationId: s.organizationId },
      },
      // Dois cliques seguidos não criam duas contas.
      { idempotencyKey: `mesvio-acct:${s.establishmentId}` },
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
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${baseUrl}/painel/stripe/ligar`,
    return_url: `${baseUrl}/painel/stripe/retorno`,
  });
  return link.url;
}

/**
 * Regressa do formulário: se a conta já pode cobrar, regista o domínio da MESVIO nessa conta
 * (obrigatório para o Apple Pay aparecer na ementa). Repetir não faz mal.
 */
export async function finishOnboarding(db: Db, s: Scope, domain: string, stripe: Stripe = stripeClient()): Promise<ConnectStatus> {
  const status = await getConnectStatus(db, s, stripe);
  if (status.chargesEnabled && status.accountId && !/^(localhost|127\.|\[::1\])/.test(domain)) {
    try {
      await stripe.paymentMethodDomains.create({ domain_name: domain, enabled: true }, { stripeAccount: status.accountId });
    } catch (err) {
      // Já registado: a Stripe devolve erro; o importante é existir.
      console.warn("[stripe] registo do domínio para Apple Pay:", err instanceof Error ? err.message : err);
    }
  }
  return status;
}
