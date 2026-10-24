import "server-only";
import { randomUUID } from "node:crypto";
import { isLocalBench } from "@/server/db/local-url";
import { getStripeProvider } from "./stripe-provider";

export type PaymentProviderId = "mock" | "stripe";
export type ProviderPaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface CreatePaymentInput {
  amountCents: number;
  /** Comissão da plataforma retida no pagamento. */
  applicationFeeCents: number;
  /** Conta do restaurante no fornecedor (Stripe Connect acct_…). */
  accountId: string | null;
  /** Mesmo pedido repetido → mesmo pagamento no fornecedor (sem cobrar duas vezes). */
  idempotencyKey: string;
  description: string;
  metadata: Record<string, string>;
}

export interface CreatedPayment {
  providerRef: string;
  /** Segredo que o browser usa para mostrar o formulário do fornecedor (Stripe Payment Element). */
  clientSecret?: string;
}

/**
 * Fornecedor de pagamentos. A app nunca vê dados de cartões nem de MB WAY: o cliente paga
 * diretamente no formulário do fornecedor e nós só guardamos a referência e o estado.
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  create(input: CreatePaymentInput): Promise<CreatedPayment>;
  status(providerRef: string, accountId: string | null): Promise<{ status: ProviderPaymentStatus; method?: string }>;
  /** Cancela um pagamento ainda não concluído. Devolve false se já não estava pendente (ex.: acabou de ser pago). */
  cancel(providerRef: string, accountId: string | null): Promise<boolean>;
  /**
   * Devolve (parte de) um pagamento concluído. A mesma chave idempotente não reembolsa duas vezes.
   * A comissão da plataforma é devolvida na mesma proporção.
   */
  refund(input: { providerRef: string; accountId: string | null; amountCents: number; idempotencyKey: string }): Promise<{ refundRef: string }>;
}

/**
 * Fornecedor simulado (desenvolvimento/demonstração): o "pagamento" fica pendente até ser
 * confirmado com `completeMockPayment` — o equivalente a o cliente aprovar no telemóvel.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = "mock" as const;
  private readonly payments = new Map<string, { status: ProviderPaymentStatus; method?: string; amountCents: number }>();
  private readonly byKey = new Map<string, string>();

  async create(input: CreatePaymentInput): Promise<CreatedPayment> {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return { providerRef: existing };
    const ref = `mock_pi_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    this.payments.set(ref, { status: "PENDING", amountCents: input.amountCents });
    this.byKey.set(input.idempotencyKey, ref);
    return { providerRef: ref };
  }

  async status(ref: string) {
    const p = this.payments.get(ref);
    return p ? { status: p.status, method: p.method } : { status: "FAILED" as const };
  }

  async cancel(ref: string): Promise<boolean> {
    const p = this.payments.get(ref);
    if (!p || p.status !== "PENDING") return false;
    p.status = "CANCELLED";
    return true;
  }

  private readonly refunds = new Map<string, string>();

  async refund({ providerRef, amountCents, idempotencyKey }: { providerRef: string; amountCents: number; idempotencyKey: string }) {
    const p = this.payments.get(providerRef);
    if (!p || p.status !== "SUCCEEDED" || amountCents <= 0 || amountCents > p.amountCents) throw new Error("Reembolso inválido");
    const existing = this.refunds.get(idempotencyKey);
    if (existing) return { refundRef: existing };
    const ref = `mock_re_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    this.refunds.set(idempotencyKey, ref);
    return { refundRef: ref };
  }

  /** Simulação: o cliente aprovou (true) ou recusou (false) o pagamento. */
  complete(ref: string, method: "apple_pay" | "mb_way", approved = true): boolean {
    const p = this.payments.get(ref);
    if (!p || p.status !== "PENDING") return false;
    p.status = approved ? "SUCCEEDED" : "FAILED";
    p.method = method;
    return true;
  }
}

const g = globalThis as typeof globalThis & { __mockPayments?: MockPaymentProvider };
export function getMockPaymentProvider(): MockPaymentProvider {
  g.__mockPayments ??= new MockPaymentProvider();
  return g.__mockPayments;
}

/** Este restaurante pode cobrar com este fornecedor? (Com a Stripe, só com a conta ligada.) */
export function canCharge(provider: PaymentProvider | null, accountId: string | null): boolean {
  if (!provider) return false;
  return provider.id !== "stripe" || !!accountId;
}

/**
 * Fornecedor ativo: Stripe quando há chaves; senão o simulado, só fora de produção.
 * Em produção sem Stripe, os pagamentos ficam indisponíveis (null).
 */
export function activePaymentProvider(): PaymentProvider | null {
  if (process.env.STRIPE_SECRET_KEY) return getStripeProvider();
  return process.env.NODE_ENV === "production" && !isLocalBench() ? null : getMockPaymentProvider();
}
