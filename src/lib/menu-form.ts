/** Ajudas partilhadas pelos formulários da ementa, que correm no navegador. */
export const VAT_OPTIONS = [
  { bps: 1300, label: "13% — comida e refeições" },
  { bps: 2300, label: "23% — bebidas alcoólicas, refrigerantes e outros" },
  { bps: 600, label: "6% — água, alguns bens essenciais" },
];

/** Euros escritos à portuguesa ("12,50") → cêntimos; null se não for um preço. */
export function toCents(v: string): number | null {
  const n = Number(v.trim().replace(/\s|€/g, "").replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export const toEuros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
