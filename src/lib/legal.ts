/**
 * Dados da empresa nos textos legais (/privacidade e /termos). Preencher antes de publicar:
 * os valores entre parênteses retos aparecem tal e qual no site. Os textos são uma base
 * para rever com um jurista, não aconselhamento jurídico.
 */
export const LEGAL = {
  company: "[Nome legal da empresa]",
  nif: "[NIF]",
  address: "[Morada da sede]",
  email: "[email de contacto, ex.: privacidade@mesvio.pt]",
  updatedAt: "23 de outubro de 2026",
} as const;

export const legalIsIncomplete = Object.values(LEGAL).some((v) => v.startsWith("["));
