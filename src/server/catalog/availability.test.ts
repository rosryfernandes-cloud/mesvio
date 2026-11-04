import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PosAdapter, PosCatalog } from "@/server/pos/types";
import { cachedPosCatalog, CATALOG_TTL_MS } from "./availability";

const fakePos = (provider: "mesvio" | "mock") => {
  let reads = 0;
  const pos = {
    provider,
    fetchCatalog: async () => {
      reads++;
      return { categories: [], products: [], modifierGroups: [] } as unknown as PosCatalog;
    },
  } as unknown as PosAdapter;
  return { pos, reads: () => reads };
};

describe("cache do catálogo", () => {
  it("ementa MESVIO: cada abertura lê a ementa atual, para o preço novo aparecer logo", async () => {
    const { pos, reads } = fakePos("mesvio");
    const est = randomUUID();
    await cachedPosCatalog(pos, est, Date.now());
    await cachedPosCatalog(pos, est, Date.now());
    expect(reads()).toBe(2);
  });

  it("POS externo: reaproveita durante o TTL, para não sobrecarregar a API do POS", async () => {
    const { pos, reads } = fakePos("mock");
    const est = randomUUID();
    const now = Date.now();
    await cachedPosCatalog(pos, est, now);
    await cachedPosCatalog(pos, est, now + 1000);
    expect(reads()).toBe(1);
    await cachedPosCatalog(pos, est, now + CATALOG_TTL_MS + 60_000);
    expect(reads()).toBe(2);
  });
});
