/**
 * Motor de comissões — funções puras, determinísticas e testáveis.
 *
 * Regras (docs/01-PRD.md §5.4):
 *  - Só documentos INVOICED contam; CANCELLED não contam; CREDITED geram estorno.
 *  - Base configurável: NET (sem IVA, por defeito) ou GROSS (com IVA).
 *  - Taxa em pontos base (100 = 1%).
 *  - Precisão: cada lançamento guarda base × bps (unidades de 1/10 000 cêntimo);
 *    o arredondamento para cêntimos (half-up) acontece uma única vez, no extrato.
 */
import { roundHalfUpDiv } from "@/lib/money";

export const COMMISSION_ALGORITHM_VERSION = "2026.10-v1";

export type CommissionBasis = "NET" | "GROSS";

export interface CommissionRule {
  ruleId: string;
  rateBps: number;
  basis: CommissionBasis;
}

export interface AttributableSale {
  saleId: string;
  status: "INVOICED" | "CANCELLED" | "CREDITED";
  attributableGrossCents: number;
  attributableNetCents: number;
}

export interface LedgerEntry {
  saleId: string;
  ruleId: string;
  type: "ACCRUAL" | "REVERSAL";
  basis: CommissionBasis;
  baseCents: number;
  rateBps: number;
  /** base × rateBps; dividir por 10 000 para obter cêntimos. */
  amountMicroCents: number;
  algorithmVersion: string;
}

function assertRule(rule: CommissionRule): void {
  if (!Number.isInteger(rule.rateBps) || rule.rateBps < 0 || rule.rateBps > 10_000) {
    throw new RangeError(`Taxa de comissão inválida: ${rule.rateBps} bps`);
  }
}

function baseOf(sale: AttributableSale, basis: CommissionBasis): number {
  const base = basis === "NET" ? sale.attributableNetCents : sale.attributableGrossCents;
  if (!Number.isInteger(base) || base < 0) throw new RangeError(`Base inválida na venda ${sale.saleId}`);
  return base;
}

/**
 * Lançamentos que devem existir para uma venda, dado o seu estado atual.
 * O chamador compara com os lançamentos já gravados e insere apenas os que faltam
 * (UNIQUE (pos_sale_id, type) garante idempotência).
 */
export function expectedLedgerEntries(sale: AttributableSale, rule: CommissionRule): LedgerEntry[] {
  assertRule(rule);
  if (sale.status === "CANCELLED") return [];
  const baseCents = baseOf(sale, rule.basis);
  const accrual: LedgerEntry = {
    saleId: sale.saleId,
    ruleId: rule.ruleId,
    type: "ACCRUAL",
    basis: rule.basis,
    baseCents,
    rateBps: rule.rateBps,
    amountMicroCents: baseCents * rule.rateBps,
    algorithmVersion: COMMISSION_ALGORITHM_VERSION,
  };
  if (sale.status === "INVOICED") return [accrual];
  // CREDITED: o acréscimo existe (venda foi faturada) e é anulado por um estorno simétrico.
  return [
    accrual,
    { ...accrual, type: "REVERSAL", baseCents: -baseCents, amountMicroCents: -accrual.amountMicroCents },
  ];
}

export interface StatementTotals {
  baseTotalCents: number;
  commissionCents: number;
  vatOnServiceCents: number;
  totalToInvoiceCents: number;
  entries: number;
}

/** Totais de um extrato mensal. IVA sobre o nosso serviço (taxa normal PT: 23%). */
export function summarizeStatement(entries: LedgerEntry[], serviceVatBps = 2300): StatementTotals {
  const baseTotalCents = entries.reduce((s, e) => s + e.baseCents, 0);
  const micro = entries.reduce((s, e) => s + e.amountMicroCents, 0);
  const commissionCents = roundHalfUpDiv(micro, 10_000);
  const vatOnServiceCents = roundHalfUpDiv(commissionCents * serviceVatBps, 10_000);
  return {
    baseTotalCents,
    commissionCents,
    vatOnServiceCents,
    totalToInvoiceCents: commissionCents + vatOnServiceCents,
    entries: entries.length,
  };
}
