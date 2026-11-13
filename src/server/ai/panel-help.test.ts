import { describe, expect, it } from "vitest";
import { answerPanelQuestion, panelHelpInputSchema, PANEL_GUIDE } from "./panel-help";

describe("ajuda do painel", () => {
  it("o guia fala de todos os separadores do painel", () => {
    for (const tab of ["Pedidos", "Resumo", "Mesas", "Esgotados", "Equipa", "Ementa", "Fotos", "Aparência", "Línguas", "Avaliações"]) expect(PANEL_GUIDE).toContain(`- ${tab}`);
  });
  it("responde com o texto do escritor e falha com uma mensagem quando a API falha", async () => {
    const input = panelHelpInputSchema.parse({ question: "Como mudo um preço?" });
    expect(await answerPanelQuestion(input, async () => " No separador Ementa. ")).toEqual({ ok: true, answer: "No separador Ementa." });
    expect(await answerPanelQuestion(input, async () => null)).toMatchObject({ ok: false });
  });
});
