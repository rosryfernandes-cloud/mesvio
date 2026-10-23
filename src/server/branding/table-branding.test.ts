import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { getBranding, setBranding } from "@/server/staff/staff-service";
import { getTableBranding } from "./table-branding";

const TOKEN = DEMO_TABLES[0].publicToken;
let db: Db;
let manager: StaffContext;

beforeEach(async () => {
  db = await createTestDb();
  manager = (await resolveStaffContext(db, DEMO_USERS[1].userId))!;
});

describe("identidade do restaurante na ementa", () => {
  it("sem configuração usa as cores MESVIO e nenhum logótipo", async () => {
    expect(await getTableBranding(TOKEN, db)).toMatchObject({ logoUrl: null, palette: null });
  });

  it("a cor e o logótipo gravados no painel chegam à mesa", async () => {
    await setBranding(db, manager, { brandColor: "#1d3557", brandLogoUrl: "https://exemplo.pt/logo.svg" });
    expect(await getBranding(db, manager)).toEqual({ brandColor: "#1d3557", brandLogoUrl: "https://exemplo.pt/logo.svg" });
    const b = await getTableBranding(TOKEN, db);
    expect(b?.logoUrl).toBe("https://exemplo.pt/logo.svg");
    expect(b?.palette?.brand).toBe("#1d3557");
  });

  it("a base de dados recusa cores e endereços fora do formato", async () => {
    await expect(setBranding(db, manager, { brandColor: "red", brandLogoUrl: null })).rejects.toThrow();
    await expect(setBranding(db, manager, { brandColor: null, brandLogoUrl: "javascript:alert(1)" })).rejects.toThrow();
  });

  it("um token inválido não devolve nada", async () => {
    expect(await getTableBranding("nao-existe", db)).toBeNull();
  });
});
