/**
 * Dados do prestador nos textos legais (/privacidade e /termos). A MESVIO é, por agora, a
 * atividade em nome individual do fundador (CAE 62100, aberta a 11 de novembro de 2026).
 * Os textos são uma base para rever com um jurista, não aconselhamento jurídico.
 */
export const LEGAL = {
  company: "Rodrigo Alexandre Lourenço Fernandes (empresário em nome individual)",
  nif: "262823926",
  address: "Praça Gil Vicente, 9, 2.º Esq., 2800-013 Almada",
  email: "geral@mesvio.pt",
  updatedAt: "13 de novembro de 2026",
} as const;

/**
 * IVA das mensalidades: regime de isenção do art. 53.º do CIVA (até ao limite anual de faturação).
 * Quando passar ao regime normal, trocar para false: o site volta a mostrar "+ IVA".
 */
export const VAT_EXEMPT = true;
export const VAT_NOTE = "Isento de IVA ao abrigo do artigo 53.º do CIVA.";

export const legalIsIncomplete = Object.values(LEGAL).some((v) => v.startsWith("["));
