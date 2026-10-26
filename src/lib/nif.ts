/**
 * NIF português válido: 9 dígitos, primeiro(s) dígito(s) de um tipo existente e dígito de controlo
 * certo (módulo 11). Apanha erros de escrita antes de criar um cliente com um NIF que não existe.
 */
export function isValidNif(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  // 1–3 singulares, 5 coletivas, 6 públicas, 8 empresários em nome individual (antigo), 9 irregulares;
  // 45 não residentes singulares, 7x e 9x outros tipos.
  if (!/^[1235689]/.test(value) && !/^(45|70|71|72|74|75|77|79)/.test(value)) return false;
  const d = [...value].map(Number);
  const sum = d.slice(0, 8).reduce((s, n, i) => s + n * (9 - i), 0);
  const r = sum % 11;
  return d[8] === (r < 2 ? 0 : 11 - r);
}
