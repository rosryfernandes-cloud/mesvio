/** Dinheiro sempre em cêntimos inteiros. Nunca usar floats para valores monetários. */

const eurFormatter = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
});

export function formatEur(cents: number): string {
  // Intl em pt-PT usa espaço não separável antes do símbolo; normalizamos para espaço comum.
  return eurFormatter.format(cents / 100).replace(/ /g, " ");
}

/** Arredondamento "half-up" (meio cêntimo para cima) de um racional numerador/denominador positivos. */
export function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError("roundHalfUpDiv requer inteiros seguros e denominador positivo");
  }
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  const q = Math.floor(abs / denominator);
  const r = abs - q * denominator;
  return sign * (r * 2 >= denominator ? q + 1 : q);
}

/** Valor sem IVA a partir de um valor com IVA. vatRateBps: 2300 = 23%. */
export function netFromGross(grossCents: number, vatRateBps: number): number {
  return roundHalfUpDiv(grossCents * 10_000, 10_000 + vatRateBps);
}
