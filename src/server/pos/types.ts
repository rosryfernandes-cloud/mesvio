/**
 * Contrato abstrato de integração com POS.
 *
 * Princípio: cada adaptador DECLARA o que sabe fazer (`capabilities`). A aplicação
 * nunca assume uma capacidade que o adaptador não declare. O adaptador ZoneSoft só
 * declarará capacidades depois de confirmadas na documentação oficial.
 */

export type PosProviderId = "mock" | "zonesoft" | "mesvio";

export interface PosCapabilities {
  /** Ler catálogo (produtos, preços, IVA, categorias, extras). */
  catalogSync: boolean;
  /** Ler a lista de mesas do POS. */
  tableSync: boolean;
  /** Criar um pedido associado a uma mesa. */
  createOrder: boolean;
  /** O POS devolve confirmação/aceitação explícita do pedido. */
  orderAcknowledgement: boolean;
  /** O POS informa estados posteriores (em preparação, servido). */
  orderStatusUpdates: boolean;
  /** O POS aceita uma referência externa idempotente (o nosso orderId). */
  externalIdempotencyKey: boolean;
  /** Ler documentos de venda faturados (reconciliação de comissões). */
  salesReconciliation: boolean;
  /** Ler cancelamentos, devoluções e notas de crédito. */
  refundsAndCancellations: boolean;
  /** Ler disponibilidade/esgotados em tempo real. */
  availabilitySync: boolean;
}

export interface PosModifier {
  posModifierRef: string;
  name: string;
  priceDeltaCents: number;
  available: boolean;
}

export interface PosModifierGroup {
  posGroupRef: string;
  name: string;
  kind: "variant" | "extra";
  minSelect: number;
  maxSelect: number;
  modifiers: PosModifier[];
}

export interface PosProduct {
  posProductRef: string;
  posCategoryRef: string;
  name: string;
  description?: string;
  imageUrl?: string;
  /** Preço com IVA em cêntimos. */
  priceCents: number;
  /** IVA em pontos base (13% = 1300). */
  vatRateBps: number;
  available: boolean;
  allergens: string[];
  tags: string[];
  modifierGroups: PosModifierGroup[];
}

export interface PosCategory {
  posCategoryRef: string;
  name: string;
  sortOrder: number;
  /** Agrupamento acima da categoria (família / separador da ementa, ex.: "Bar"). */
  section?: string;
}

export interface PosCatalog {
  categories: PosCategory[];
  products: PosProduct[];
  fetchedAt: Date;
}

export interface PosTable {
  posTableRef: string;
  label: string;
}

export interface PosOrderLine {
  posProductRef: string;
  quantity: number;
  unitPriceCents: number;
  modifiers: { posModifierRef: string }[];
  notes?: string;
}

export interface PosOrderRequest {
  /** O nosso id de pedido — usado como chave idempotente quando suportado. */
  externalOrderId: string;
  posTableRef: string;
  lines: PosOrderLine[];
  notes?: string;
}

export type PosOrderResult =
  | { outcome: "accepted"; posOrderRef: string }
  | { outcome: "submitted"; posOrderRef?: string } // recebido, sem aceitação explícita
  | { outcome: "rejected"; reason: string }
  /** Falha comprovadamente ANTES de o POS receber o pedido (ex.: ligação recusada): reenviar é seguro. */
  | { outcome: "retryable_error"; reason: string }
  /**
   * Resultado desconhecido (timeout, ligação caiu a meio): o POS PODE ter recebido o pedido.
   * Só se reenvia automaticamente se o POS deduplicar pela referência externa (auditoria F1).
   */
  | { outcome: "unknown"; reason: string };

export interface PosSaleDocument {
  posDocumentRef: string;
  externalOrderId?: string;
  status: "INVOICED" | "CANCELLED" | "CREDITED";
  issuedAt: Date;
  grossCents: number;
  netCents: number;
}

/** Credenciais/configuração de um estabelecimento (já desencriptadas, só em memória). */
export interface PosConnectionConfig {
  establishmentId: string;
  settings: Record<string, string>;
}

export class PosCapabilityNotSupportedError extends Error {
  constructor(provider: PosProviderId, capability: keyof PosCapabilities) {
    super(`O POS "${provider}" não suporta a capacidade "${capability}".`);
    this.name = "PosCapabilityNotSupportedError";
  }
}

export interface PosAdapter {
  readonly provider: PosProviderId;
  readonly capabilities: PosCapabilities;
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
  fetchCatalog(): Promise<PosCatalog>;
  fetchTables(): Promise<PosTable[]>;
  /** `signal` é abortado quando o worker desiste de esperar (timeout): o adaptador deve cancelar o pedido HTTP. */
  submitOrder(order: PosOrderRequest, opts?: { signal?: AbortSignal }): Promise<PosOrderResult>;
  /** Documentos de venda emitidos num intervalo (reconciliação). */
  fetchSalesDocuments(from: Date, to: Date): Promise<PosSaleDocument[]>;
}
