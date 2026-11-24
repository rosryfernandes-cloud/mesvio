import { describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/server/db/client";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_ESTABLISHMENT, DEMO_ORGANIZATION, DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { createDbTableDirectory } from "@/server/tables/table-directory";

vi.mock("server-only", () => ({}));
const { getHouseSuggestions, saveHouseSuggestions } = await import("./house-suggestions");
const { getTableMenu } = await import("./get-table-menu");

const scope = { userId: DEMO_USERS[0].userId, organizationId: DEMO_ORGANIZATION.id, establishmentId: DEMO_ESTABLISHMENT.id };

describe("sugestões da casa", () => {
  it("começam escondidas; ligadas, aparecem na ementa só com pratos que existem, pela ordem escolhida", async () => {
    const db = await createTestDb();
    const pos = new MockPosAdapter();
    const table = DEMO_TABLES[0];
    const menu = () => getTableMenu(table.publicToken, { db, directory: createDbTableDirectory(db, () => pos) });

    expect(await getHouseSuggestions(db, scope.organizationId, scope.establishmentId)).toEqual({ enabled: false, refs: [] });
    expect((await menu())?.suggestions).toEqual([]);

    const all = (await menu())!.categories.flatMap((c) => c.products.map((p) => p.ref));
    const [a, b] = [all[3], all[0]];
    expect((await saveHouseSuggestions(db, scope, { enabled: true, refs: [a, "NAO-EXISTE", b, a] })).ok).toBe(true);
    expect((await menu())?.suggestions).toEqual([a, b]);

    await saveHouseSuggestions(db, scope, { enabled: false, refs: [a, b] });
    expect((await menu())?.suggestions).toEqual([]);
    expect((await saveHouseSuggestions(db, scope, { enabled: true, refs: all.slice(0, 9) })).ok).toBe(false);
  });
});
