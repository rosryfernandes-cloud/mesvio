import { describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/server/db/client";

vi.mock("server-only", () => ({}));
const { answerCentralQuestion, centralSnapshot, centralAssistantInputSchema } = await import("./central-assistant");

describe("ajudante da Central", () => {
  it("responde com um retrato dos dados reais (restaurantes, totais, alertas, links) e não inventa quando falha", async () => {
    const db = await createTestDb();
    const snap = await centralSnapshot(db, new Date("2026-11-24T10:00:00Z"));
    expect(snap).toContain("Totais (só clientes reais)");
    expect(snap).toContain("Restaurantes de teste");
    expect(snap).toContain("Swara Beach ClubHouse"); // o restaurante de demonstração aparece como teste
    expect(snap).toContain("Links de demonstração");

    const input = centralAssistantInputSchema.parse({ question: "Como estão os restaurantes?" });
    let seen = "";
    const ok = await answerCentralQuestion(db, input, async (_i, s) => {
      seen = s;
      return "Tudo bem.";
    });
    expect(ok).toEqual({ ok: true, answer: "Tudo bem." });
    expect(seen).toContain("Clientes (");
    expect((await answerCentralQuestion(db, input, async () => null)).ok).toBe(false);
    expect(centralAssistantInputSchema.safeParse({ question: "a" }).success).toBe(false);
  });
});
