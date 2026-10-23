import type { PosAdapter, PosConnectionConfig, PosProviderId } from "./types";
import { MockPosAdapter } from "./mock/mock-pos-adapter";
import { ZoneSoftAdapter } from "./zonesoft/zonesoft-adapter";

/**
 * Fábrica de adaptadores POS. Na Fase 3 a configuração virá de `pos_integrations`
 * (credenciais desencriptadas apenas em memória, no servidor).
 */
export function createPosAdapter(provider: PosProviderId, config: PosConnectionConfig): PosAdapter {
  switch (provider) {
    case "mock":
      // Um único MockPOS por processo: guarda os pedidos recebidos (idempotência entre reenvios).
      return getDemoPosAdapter();
    case "zonesoft":
      return new ZoneSoftAdapter(config);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Fornecedor POS desconhecido: ${String(exhaustive)}`);
    }
  }
}

// Instância partilhada do MockPOS. Em `globalThis` para ser a mesma entre o worker e as rotas.
const g = globalThis as typeof globalThis & { __demoPos?: MockPosAdapter };
export function getDemoPosAdapter(): MockPosAdapter {
  g.__demoPos ??= new MockPosAdapter();
  return g.__demoPos;
}

/** POS de um estabelecimento. As credenciais (desencriptadas só em memória) entram aqui com a ZoneSoft. */
export type PosResolver = (provider: PosProviderId, establishmentId: string) => PosAdapter;

// Um adaptador por restaurante e fornecedor, reaproveitado entre pedidos (ligações e cache do catálogo).
const adapters = (g as typeof g & { __posAdapters?: Map<string, PosAdapter> });
export const resolvePosAdapter: PosResolver = (provider, establishmentId) => {
  adapters.__posAdapters ??= new Map();
  const key = `${provider}:${establishmentId}`;
  let a = adapters.__posAdapters.get(key);
  if (!a) adapters.__posAdapters.set(key, (a = createPosAdapter(provider, { establishmentId, settings: {} })));
  return a;
};
