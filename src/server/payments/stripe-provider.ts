import "server-only";
import Stripe from "stripe";
import type { CreatedPayment, CreatePaymentInput, PaymentProvider, ProviderPaymentStatus } from "./provider";

/**
 * Stripe Connect com cobranças diretas: o PaymentIntent é criado NA CONTA DO RESTAURANTE
 * (cabeçalho Stripe-Account). O restaurante é o comerciante (aparece no extrato do cliente, emite
 * a fatura, responde a disputas); a comissão MESVIO sai como `application_fee_amount`. A MESVIO
 * nunca guarda dinheiro de clientes nem vê dados de cartão (o formulário é da Stripe).
 */

/** Métodos que se pagam na hora, sem sair da página: cartão (com Apple Pay / Google Pay) e MB WAY. */
// Multibanco e débito direto não são imediatos; o Revolut Pay fica de fora por decisão da MESVIO
// (a Stripe mostra-o se estiver ativo na conta do restaurante, mesmo desligado na da plataforma).
const EXCLUDED_METHODS: Stripe.PaymentIntentCreateParams.ExcludedPaymentMethodType[] = ["multibanco", "sepa_debit", "customer_balance", "revolut_pay"];

export class StripePaymentProvider implements PaymentProvider {
  readonly id = "stripe" as const;
  constructor(private readonly stripe: Stripe) {}

  private static account(accountId: string | null): string {
    // Sem conta ligada não se cobra: o dinheiro iria para a conta da plataforma.
    if (!accountId) throw new Error("Restaurante sem conta Stripe ligada");
    return accountId;
  }

  async create(input: CreatePaymentInput): Promise<CreatedPayment> {
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: "eur",
        application_fee_amount: input.applicationFeeCents,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        excluded_payment_method_types: EXCLUDED_METHODS,
        description: input.description,
        metadata: input.metadata,
      },
      { stripeAccount: StripePaymentProvider.account(input.accountId), idempotencyKey: input.idempotencyKey },
    );
    return { providerRef: pi.id, clientSecret: pi.client_secret ?? undefined };
  }

  async status(providerRef: string, accountId: string | null): Promise<{ status: ProviderPaymentStatus; method?: string }> {
    const pi = await this.stripe.paymentIntents.retrieve(providerRef, { expand: ["latest_charge"] }, { stripeAccount: StripePaymentProvider.account(accountId) });
    return { status: mapStatus(pi.status), method: methodOf(pi) };
  }

  async cancel(providerRef: string, accountId: string | null): Promise<boolean> {
    try {
      await this.stripe.paymentIntents.cancel(providerRef, {}, { stripeAccount: StripePaymentProvider.account(accountId) });
      return true;
    } catch (err) {
      // Já pago, já cancelado ou a processar: não está "pendente e cancelável".
      if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "payment_intent_unexpected_state") return false;
      throw err;
    }
  }

  async refund(input: { providerRef: string; accountId: string | null; amountCents: number; idempotencyKey: string }): Promise<{ refundRef: string }> {
    const r = await this.stripe.refunds.create(
      { payment_intent: input.providerRef, amount: input.amountCents, refund_application_fee: true },
      { stripeAccount: StripePaymentProvider.account(input.accountId), idempotencyKey: input.idempotencyKey },
    );
    return { refundRef: r.id };
  }
}

/**
 * Estados da Stripe → estados MESVIO. Uma tentativa recusada deixa o PaymentIntent em
 * `requires_payment_method` (o cliente pode tentar de novo no mesmo formulário), por isso conta
 * como PENDENTE e não como falhado: marcá-lo falhado e criar outro arriscava cobrar os dois.
 * Os abandonados são cancelados ao fim de 15 min pela reconciliação.
 */
export function mapStatus(status: Stripe.PaymentIntent.Status): ProviderPaymentStatus {
  if (status === "succeeded") return "SUCCEEDED";
  if (status === "canceled") return "CANCELLED";
  return "PENDING";
}

/** Método usado: apple_pay / google_pay (carteiras), card, mb_way… */
export function methodOf(pi: Stripe.PaymentIntent): string | undefined {
  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const details = charge?.payment_method_details;
  if (!details) return undefined;
  if (details.type === "card") return details.card?.wallet?.type ?? "card";
  return details.type;
}

let client: Stripe | null = null;
/** Cliente da API (só servidor). A versão da API fica fixa na da biblioteca instalada. */
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY em falta");
  client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000, appInfo: { name: "MESVIO" } });
  return client;
}

let provider: StripePaymentProvider | null = null;
export function getStripeProvider(): StripePaymentProvider {
  provider ??= new StripePaymentProvider(stripeClient());
  return provider;
}
