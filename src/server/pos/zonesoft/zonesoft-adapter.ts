/**
 * Adaptador ZoneSoft (ZS Rest) através da ZSROI (ZS Restaurant Ordering Integration).
 *
 * Documentação oficial: portal developer.zonesoft.org → ZSROI Docs ("Generic Integration").
 *
 * - Ementa: IMPLEMENTADO. A ZoneSoft envia a ementa para o nosso endpoint
 *   (`/api/pos/zonesoft/menu`) quando o restaurante carrega em "Sync Menus" no ZSBMS; fica guardada
 *   na BD e é lida daqui como a ementa MESVIO (fotos, traduções e esgotados funcionam igual).
 * - Estados dos pedidos: IMPLEMENTADO no endpoint `/api/pos/zonesoft/order-status`.
 * - Enviar pedidos: IMPLEMENTADO (POST /v1.0/integration/order, assinado com HMAC-SHA256). A ZSROI só aceita
 *   DELIVERY/PICKUP e não tem campo de mesa: vai como PICKUP com a mesa no nome e nas observações, até a
 *   ZoneSoft indicar o campo certo (ver zsroi-order.ts). A aceitação chega depois por /order-status.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { posIntegrations } from "@/server/db/schema";
import { MesvioMenuAdapter } from "../mesvio/mesvio-menu-adapter";
import { signRequest, type ZoneSoftCredentials } from "./zsroi-auth";
import { buildZsroiOrder, interpretZsroiResponse, ZSROI_ORDER_URL } from "./zsroi-order";
import { readCredentials } from "./zsroi-service";
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
      `Integração ZoneSoft indisponível (${operation}): a ZSROI não oferece esta operação.`,
    );
    this.name = "ZoneSoftNotAvailableError";
  }
}

export class ZoneSoftAdapter implements PosAdapter {
  readonly provider = "zonesoft" as const;
  readonly capabilities: PosCapabilities = {
    catalogSync: true,
    tableSync: false,
    createOrder: true,
    orderAcknowledgement: true,
    orderStatusUpdates: true,
    externalIdempotencyKey: false,
    salesReconciliation: false,
    refundsAndCancellations: false,
    availabilitySync: false,
  };

  private readonly stored: MesvioMenuAdapter;

  constructor(
    private readonly config: PosConnectionConfig,
    private readonly deps: {
      credentials?: () => Promise<ZoneSoftCredentials | null>;
      fetch?: typeof fetch;
      now?: () => Date;
      url?: string;
    } = {},
  ) {
    this.stored = new MesvioMenuAdapter(config.establishmentId);
  }

  /** Credenciais do restaurante (cifradas em pos_integrations). */
  private async credentials(): Promise<ZoneSoftCredentials | null> {
    if (this.deps.credentials) return this.deps.credentials();
    const db = await getDb();
    const [row] = await db
      .select({ ciphertext: posIntegrations.credentialsCiphertext })
      .from(posIntegrations)
      .where(eq(posIntegrations.establishmentId, this.config.establishmentId));
    return readCredentials(row?.ciphertext ?? null);
  }

  async healthCheck() {
    const creds = await this.credentials().catch(() => null);
    return creds ? { ok: true, detail: `ZoneSoft (ZSROI) · loja ${creds.storeId}` } : { ok: false, detail: "ZoneSoft sem credenciais: ligar na Central." };
  }

  /** A ementa que a ZoneSoft enviou na última sincronização (guardada na BD). */
  async fetchCatalog(): Promise<PosCatalog> {
    return this.stored.fetchCatalog();
  }

  async fetchTables(): Promise<PosTable[]> {
    throw new ZoneSoftNotAvailableError("fetchTables");
  }

  async submitOrder(order: PosOrderRequest, opts: { signal?: AbortSignal } = {}): Promise<PosOrderResult> {
    const creds = await this.credentials();
    if (!creds) return { outcome: "rejected", reason: "ZoneSoft sem credenciais: ligar o restaurante na Central." };
    const body = JSON.stringify(buildZsroiOrder(order, creds, (this.deps.now ?? (() => new Date()))()));
    let res: Response;
    try {
      res = await (this.deps.fetch ?? fetch)(this.deps.url ?? process.env.ZONESOFT_ZSROI_ORDER_URL ?? ZSROI_ORDER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: creds.appKey, "X-Integration-Signature": signRequest(body, creds.appSecret) },
        body,
        signal: opts.signal,
      });
    } catch (err) {
      // Sem resposta: não sabemos se a ZoneSoft recebeu (o worker não reenvia sozinho).
      return { outcome: "unknown", reason: err instanceof Error ? err.message : "Sem ligação à ZoneSoft" };
    }
    const json = await res.json().catch(() => null);
    return interpretZsroiResponse(res.status, json);
  }

  async fetchSalesDocuments(_from: Date, _to: Date): Promise<PosSaleDocument[]> {
    throw new ZoneSoftNotAvailableError("fetchSalesDocuments");
  }
}
