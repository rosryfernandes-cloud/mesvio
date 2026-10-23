import { describe, expect, it } from "vitest";
import { expectedLedgerEntries, summarizeStatement, type CommissionRule } from "./calculate";

const rule: CommissionRule = { ruleId: "r1", rateBps: 100, basis: "NET" };

describe("motor de comissões", () => {
  it("aplica 1% sobre o valor sem IVA de uma venda faturada", () => {
    const entries = expectedLedgerEntries(
      { saleId: "s1", status: "INVOICED", attributableGrossCents: 12300, attributableNetCents: 10000 },
      rule,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "ACCRUAL", baseCents: 10000, rateBps: 100 });
    expect(summarizeStatement(entries).commissionCents).toBe(100); // 1,00 €
  });

  it("usa o valor com IVA quando a base é GROSS", () => {
    const entries = expectedLedgerEntries(
      { saleId: "s1", status: "INVOICED", attributableGrossCents: 12300, attributableNetCents: 10000 },
      { ...rule, basis: "GROSS" },
    );
    expect(summarizeStatement(entries).commissionCents).toBe(123);
  });

  it("exclui vendas canceladas", () => {
    expect(
      expectedLedgerEntries(
        { saleId: "s2", status: "CANCELLED", attributableGrossCents: 5000, attributableNetCents: 4425 },
        rule,
      ),
    ).toEqual([]);
  });

  it("estorna integralmente uma venda com nota de crédito", () => {
    const entries = expectedLedgerEntries(
      { saleId: "s3", status: "CREDITED", attributableGrossCents: 5000, attributableNetCents: 4425 },
      rule,
    );
    expect(entries.map((e) => e.type)).toEqual(["ACCRUAL", "REVERSAL"]);
    const totals = summarizeStatement(entries);
    expect(totals.baseTotalCents).toBe(0);
    expect(totals.commissionCents).toBe(0);
  });

  it("arredonda só no extrato, evitando perdas de cêntimos por pedido", () => {
    // 3 pedidos de 0,49 € sem IVA → 1% = 0,0049 € cada; arredondar por pedido daria 0.
    const entries = ["a", "b", "c"].flatMap((id) =>
      expectedLedgerEntries({ saleId: id, status: "INVOICED", attributableGrossCents: 55, attributableNetCents: 49 }, rule),
    );
    expect(summarizeStatement(entries).commissionCents).toBe(1); // 0,0147 € → 0,01 €
  });

  it("calcula IVA (23%) sobre a fatura de serviço", () => {
    const entries = expectedLedgerEntries(
      { saleId: "s4", status: "INVOICED", attributableGrossCents: 1_230_000, attributableNetCents: 1_000_000 },
      rule,
    );
    const t = summarizeStatement(entries);
    expect(t).toMatchObject({ commissionCents: 10_000, vatOnServiceCents: 2_300, totalToInvoiceCents: 12_300 });
  });

  it("rejeita taxas inválidas", () => {
    const sale = { saleId: "x", status: "INVOICED" as const, attributableGrossCents: 1, attributableNetCents: 1 };
    expect(() => expectedLedgerEntries(sale, { ...rule, rateBps: -1 })).toThrow();
    expect(() => expectedLedgerEntries(sale, { ...rule, rateBps: 1.5 })).toThrow();
  });
});
