/**
 * MockPOS — adaptador simulado, completamente funcional, em memória.
 * Serve para desenvolvimento, testes e demonstrações sem depender da ZoneSoft.
 *
 * Comportamentos simuláveis (via `MockPosOptions`):
 *  - latência, aceitação automática ou só "recebido", rejeição de artigos esgotados,
 *    falhas transitórias (para testar tentativas de reenvio), faturação e notas de crédito.
 */
import { netFromGross } from "@/lib/money";
import type {
  PosAdapter,
  PosCapabilities,
  PosCatalog,
  PosOrderRequest,
  PosOrderResult,
  PosProduct,
  PosSaleDocument,
  PosTable,
} from "../types";
import { DEMO_CATEGORIES, DEMO_PRODUCTS, DEMO_TABLES } from "./demo-data";

export interface MockPosOptions {
  latencyMs?: number;
  /** "accept": POS confirma; "submit_only": recebe sem confirmar (testa fluxo manual). */
  acceptMode?: "accept" | "submit_only";
  /** Número de falhas transitórias a devolver antes de aceitar (por pedido). */
  transientFailuresPerOrder?: number;
  products?: PosProduct[];
  tables?: PosTable[];
  now?: () => Date;
}

interface StoredOrder {
  posOrderRef: string;
  request: PosOrderRequest;
  grossCents: number;
  netCents: number;
  createdAt: Date;
}

export class MockPosAdapter implements PosAdapter {
  readonly provider = "mock" as const;
  readonly capabilities: PosCapabilities = {
    catalogSync: true,
    tableSync: true,
    createOrder: true,
    orderAcknowledgement: true,
    orderStatusUpdates: false,
    externalIdempotencyKey: true,
    salesReconciliation: true,
    refundsAndCancellations: true,
    availabilitySync: true,
  };

  private readonly products: PosProduct[];
  private readonly tables: PosTable[];
  private readonly orders = new Map<string, StoredOrder>(); // por externalOrderId
  private readonly failuresSeen = new Map<string, number>();
  private readonly documents: PosSaleDocument[] = [];
  private seq = 0;
  private docSeq = 0;

  constructor(private readonly opts: MockPosOptions = {}) {
    this.products = structuredClone(opts.products ?? DEMO_PRODUCTS);
    this.tables = structuredClone(
      opts.tables ?? DEMO_TABLES.map(({ posTableRef, label }) => ({ posTableRef, label })),
    );
  }

  private now(): Date {
    return this.opts.now ? this.opts.now() : new Date();
  }

  private async delay(): Promise<void> {
    const ms = this.opts.latencyMs ?? 0;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }

  async healthCheck() {
    return { ok: true, detail: "MockPOS em memória" };
  }

  async fetchCatalog(): Promise<PosCatalog> {
    await this.delay();
    return {
      categories: structuredClone(DEMO_CATEGORIES),
      products: structuredClone(this.products),
      fetchedAt: this.now(),
    };
  }

  async fetchTables(): Promise<PosTable[]> {
    await this.delay();
    return structuredClone(this.tables);
  }

  /** Utilitário de simulação: marcar produto como esgotado/disponível no "POS". */
  setAvailability(posProductRef: string, available: boolean): void {
    const prod = this.products.find((x) => x.posProductRef === posProductRef);
    if (!prod) throw new Error(`Produto ${posProductRef} não existe no MockPOS`);
    prod.available = available;
  }

  async submitOrder(order: PosOrderRequest): Promise<PosOrderResult> {
    await this.delay();

    // Idempotência: o mesmo pedido externo devolve sempre o mesmo resultado.
    const existing = this.orders.get(order.externalOrderId);
    if (existing) return this.successResult(existing.posOrderRef);

    const failuresWanted = this.opts.transientFailuresPerOrder ?? 0;
    const seen = this.failuresSeen.get(order.externalOrderId) ?? 0;
    if (seen < failuresWanted) {
      this.failuresSeen.set(order.externalOrderId, seen + 1);
      return { outcome: "retryable_error", reason: "MockPOS: falha transitória simulada" };
    }

    if (!this.tables.some((t) => t.posTableRef === order.posTableRef)) {
      return { outcome: "rejected", reason: `Mesa ${order.posTableRef} desconhecida no POS` };
    }
    if (order.lines.length === 0) return { outcome: "rejected", reason: "Pedido sem linhas" };

    let grossCents = 0;
    let netCents = 0;
    for (const line of order.lines) {
      const prod = this.products.find((x) => x.posProductRef === line.posProductRef);
      if (!prod) return { outcome: "rejected", reason: `Artigo ${line.posProductRef} desconhecido` };
      if (!prod.available) return { outcome: "rejected", reason: `${prod.name} está esgotado` };
      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        return { outcome: "rejected", reason: "Quantidade inválida" };
      }
      let unit = prod.priceCents;
      for (const m of line.modifiers) {
        const mod = prod.modifierGroups.flatMap((g) => g.modifiers).find((x) => x.posModifierRef === m.posModifierRef);
        if (!mod) return { outcome: "rejected", reason: `Extra ${m.posModifierRef} inválido para ${prod.name}` };
        unit += mod.priceDeltaCents;
      }
      if (unit !== line.unitPriceCents) {
        return { outcome: "rejected", reason: `Preço divergente para ${prod.name}` };
      }
      const lineGross = unit * line.quantity;
      grossCents += lineGross;
      netCents += netFromGross(lineGross, prod.vatRateBps);
    }

    const posOrderRef = `MOCK-${String(++this.seq).padStart(6, "0")}`;
    this.orders.set(order.externalOrderId, {
      posOrderRef,
      request: structuredClone(order),
      grossCents,
      netCents,
      createdAt: this.now(),
    });
    return this.successResult(posOrderRef);
  }

  private successResult(posOrderRef: string): PosOrderResult {
    return this.opts.acceptMode === "submit_only"
      ? { outcome: "submitted", posOrderRef }
      : { outcome: "accepted", posOrderRef };
  }

  /** Simulação: o restaurante fecha a conta no POS e emite fatura para o pedido. */
  invoiceOrder(externalOrderId: string): PosSaleDocument {
    const o = this.orders.get(externalOrderId);
    if (!o) throw new Error(`Pedido ${externalOrderId} não existe no MockPOS`);
    const doc: PosSaleDocument = {
      posDocumentRef: `FS MOCK/${++this.docSeq}`,
      externalOrderId,
      status: "INVOICED",
      issuedAt: this.now(),
      grossCents: o.grossCents,
      netCents: o.netCents,
    };
    this.documents.push(doc);
    return structuredClone(doc);
  }

  /** Simulação: nota de crédito total sobre um documento. */
  creditDocument(posDocumentRef: string): PosSaleDocument {
    const doc = this.documents.find((d) => d.posDocumentRef === posDocumentRef);
    if (!doc) throw new Error(`Documento ${posDocumentRef} não existe`);
    doc.status = "CREDITED";
    return structuredClone(doc);
  }

  async fetchSalesDocuments(from: Date, to: Date): Promise<PosSaleDocument[]> {
    await this.delay();
    return structuredClone(this.documents.filter((d) => d.issuedAt >= from && d.issuedAt < to));
  }
}
