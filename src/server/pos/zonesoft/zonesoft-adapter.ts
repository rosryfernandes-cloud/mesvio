/**
 * Adaptador ZoneSoft (ZS Rest) — ESQUELETO, NÃO IMPLEMENTADO.
 *
 * ⚠️ Ainda não temos a documentação oficial da API da ZoneSoft.
 * Por regra do projeto, este ficheiro NÃO contém endpoints, formatos de credenciais
 * nem capacidades presumidas. Todas as capacidades estão a `false` até serem
 * confirmadas por escrito pela ZoneSoft (ver docs/04-INTEGRACAO-POS.md, secção 4).
 *
 * Quando a documentação chegar:
 *  1. Preencher a matriz de capacidades em docs/04-INTEGRACAO-POS.md.
 *  2. Implementar cada método, com testes de contrato contra o sandbox oficial.
 *  3. Só então ativar as capacidades correspondentes abaixo.
 */
import type {
  PosAdapter,
  PosCapabilities,
  PosCatalog,
  PosConnectionConfig,
  PosOrderRequest,
  PosOrderResult,
  PosSaleDocument,
  PosTable,
} from "../types";

export class ZoneSoftNotAvailableError extends Error {
  constructor(operation: string) {
    super(
      `Integração ZoneSoft indisponível (${operation}): aguarda documentação oficial da API. ` +
        `Use o adaptador "mock" até lá.`,
    );
    this.name = "ZoneSoftNotAvailableError";
  }
}

export class ZoneSoftAdapter implements PosAdapter {
  readonly provider = "zonesoft" as const;
  readonly capabilities: PosCapabilities = {
    catalogSync: false,
    tableSync: false,
    createOrder: false,
    orderAcknowledgement: false,
    orderStatusUpdates: false,
    externalIdempotencyKey: false,
    salesReconciliation: false,
    refundsAndCancellations: false,
    availabilitySync: false,
  };

  // A configuração é guardada para a futura implementação; não é lida nem validada agora.
  constructor(private readonly config: PosConnectionConfig) {}

  async healthCheck() {
    return { ok: false, detail: "Adaptador ZoneSoft por implementar (sem documentação oficial)." };
  }

  async fetchCatalog(): Promise<PosCatalog> {
    throw new ZoneSoftNotAvailableError("fetchCatalog");
  }

  async fetchTables(): Promise<PosTable[]> {
    throw new ZoneSoftNotAvailableError("fetchTables");
  }

  async submitOrder(_order: PosOrderRequest): Promise<PosOrderResult> {
    throw new ZoneSoftNotAvailableError("submitOrder");
  }

  async fetchSalesDocuments(_from: Date, _to: Date): Promise<PosSaleDocument[]> {
    throw new ZoneSoftNotAvailableError("fetchSalesDocuments");
  }
}
