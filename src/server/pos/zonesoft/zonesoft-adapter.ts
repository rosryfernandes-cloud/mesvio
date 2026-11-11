/**
 * Adaptador ZoneSoft (ZS Rest) através da ZSROI (ZS Restaurant Ordering Integration).
 *
 * Documentação oficial: portal developer.zonesoft.org → ZSROI Docs ("Generic Integration").
 *
 * - Ementa: IMPLEMENTADO. A ZoneSoft envia a ementa para o nosso endpoint
 *   (`/api/pos/zonesoft/menu`) quando o restaurante carrega em "Sync Menus" no ZSBMS; fica guardada
 *   na BD e é lida daqui como a ementa MESVIO (fotos, traduções e esgotados funcionam igual).
 * - Estados dos pedidos: IMPLEMENTADO no endpoint `/api/pos/zonesoft/order-status`.
 * - Enviar pedidos: POR IMPLEMENTAR. A ZSROI só aceita `type_order` DELIVERY/PICKUP e não tem campo
 *   de mesa: à espera da resposta da ZoneSoft sobre como indicar a mesa. Até lá `createOrder` é false.
 */
import { MesvioMenuAdapter } from "../mesvio/mesvio-menu-adapter";
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
      `Integração ZoneSoft indisponível (${operation}): o envio de pedidos pela ZSROI ainda não está implementado.`,
    );
    this.name = "ZoneSoftNotAvailableError";
  }
}

export class ZoneSoftAdapter implements PosAdapter {
  readonly provider = "zonesoft" as const;
  readonly capabilities: PosCapabilities = {
    catalogSync: true,
    tableSync: false,
    createOrder: false,
    orderAcknowledgement: false,
    orderStatusUpdates: false,
    externalIdempotencyKey: false,
    salesReconciliation: false,
    refundsAndCancellations: false,
    availabilitySync: false,
  };

  private readonly stored: MesvioMenuAdapter;

  constructor(private readonly config: PosConnectionConfig) {
    this.stored = new MesvioMenuAdapter(config.establishmentId);
  }

  async healthCheck() {
    return { ok: false, detail: "ZoneSoft: ementa sincronizada pela ZSROI; envio de pedidos por implementar." };
  }

  /** A ementa que a ZoneSoft enviou na última sincronização (guardada na BD). */
  async fetchCatalog(): Promise<PosCatalog> {
    return this.stored.fetchCatalog();
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
