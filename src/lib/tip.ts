/** Gorjeta máxima: metade da conta ou 10 €, o que for maior, e nunca mais de 100 € (evita enganos ao escrever). */
export const maxTipCents = (dueCents: number) => Math.min(Math.max(Math.floor(dueCents * 0.5), 10_00), 100_00);

/** "2,5" ou "2.50" → 250 cêntimos; vazio → 0; texto que não é um valor → null. */
export function parseTipEuros(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
