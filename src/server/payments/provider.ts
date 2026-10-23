import "server-only";
import { randomUUID } from "node:crypto";
import { isLocalBench } from "@/server/db/local-url";

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

/**
 * Fornecedor ativo: Stripe quando há chaves; senão o simulado, só fora de produção.
 * Em produção sem Stripe, os pagamentos ficam indisponíveis (null).
 */
export function activePaymentProvider(): PaymentProvider | null {
  if (process.env.STRIPE_SECRET_KEY) {
    // A implementação Stripe entra quando houver chaves de teste para a verificar (docs/08).
    throw new Error("Pagamentos Stripe ainda não ligados: falta a implementação verificada com chaves de teste.");
  }
  return process.env.NODE_ENV === "production" && !isLocalBench() ? null : getMockPaymentProvider();
}
