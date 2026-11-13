import { describe, expect, it } from "vitest";
import { parseProspects } from "./prospect-csv";

describe("lista de restaurantes colada", () => {
  it("lê o CSV da prospeção (com cabeçalho, ';' e aspas)", () => {
    const csv = `nome;localidade;tipo;link_ementa;formato_ementa;email;telefone;notas;prioridade
Café do Mar;Costa;Praia;https://cafedomar.pt/ementa-pt/;site;info@cafedomar.pt;935;"Junto à praia; EN";A
Sem link;Almada;Tasca;;;geral@x.pt;;;C
D'Maré;Seixal;Bar;dmare.pt/pdf/menu.pdf;pdf;geral@dmare.pt / reservas@dmare.pt;917;;A`;
    expect(parseProspects(csv)).toEqual([
      { name: "Café do Mar", url: "https://cafedomar.pt/ementa-pt/", email: "info@cafedomar.pt" },
      { name: "D'Maré", url: "https://dmare.pt/pdf/menu.pdf", email: "geral@dmare.pt" },
    ]);
  });

  it("sem cabeçalho: nome, link, email (folha de cálculo com tabulações)", () => {
    expect(parseProspects("Tasca\thttps://tasca.pt/menu\tola@tasca.pt\nOutra\thttps://outra.pt")).toEqual([
      { name: "Tasca", url: "https://tasca.pt/menu", email: "ola@tasca.pt" },
      { name: "Outra", url: "https://outra.pt", email: "" },
    ]);
  });
});
