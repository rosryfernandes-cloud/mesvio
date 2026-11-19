/**
 * Plano contratado por cada restaurante. O plano liga ou desliga funções da app:
 * - "menu": só a ementa digital (ver, sem pedir nem chamar o empregado);
 * - "orders": ementa + pedidos na mesa, talões, chamar empregado e pedir a conta (paga-se no restaurante);
 * - "payments": tudo + pagar no telemóvel (camas pagam ao pedir; mesas podem pagar a conta).
 */
export type Plan = "menu" | "orders" | "payments";

export const PLANS: Plan[] = ["menu", "orders", "payments"];

export const PLAN_LABEL: Record<Plan, string> = {
  menu: "Ementa digital",
  orders: "Ementa + pedidos",
  payments: "Ementa + pedidos + pagamentos",
};

export const PLAN_DESCRIPTION: Record<Plan, string> = {
  menu: "Os clientes veem a ementa pelo QR (fotos, 5 línguas, alergénios). Não pedem pela app.",
  orders: "Pedem na mesa, os talões saem na cozinha/bar e podem chamar o empregado e pedir a conta. Pagam no restaurante.",
  payments: "Tudo, e pagam no telemóvel (Apple Pay, MB WAY, cartão), com gorjeta. As camas pagam ao pedir.",
};

export const planAllowsOrdering = (plan: Plan) => plan !== "menu";
export const planAllowsPayments = (plan: Plan) => plan === "payments";

/**
 * Sem o plano de pagamentos, os lugares "pagar ao pedir" (camas) pedem como uma mesa normal e
 * pagam no restaurante: o pedido não pode ficar preso à espera de um pagamento que não existe.
 */
export const effectiveOrderingMode = (plan: Plan, mode: "pay_later" | "pay_first"): "pay_later" | "pay_first" =>
  planAllowsPayments(plan) ? mode : "pay_later";

/**
 * Mensalidade de cada plano, em cêntimos, sem IVA (o que aparece no site e se cobra na subscrição).
 * "orders" passou de 49 € (lançamento) para 59 € a 2026-11-16, por decisão do Rodrigo; o contrato
 * garante o preço durante 12 meses. O plano com pagamentos: 69 € sem comissão (2026-11-19; antes 69 € + 1%).
 */
export const PLAN_MONTHLY_CENTS: Record<Plan, number> = { menu: 25_00, orders: 59_00, payments: 69_00 };

/** Planos com preço de lançamento (o site mostra-o junto ao preço). */
export const PLAN_LAUNCH_PRICE: Partial<Record<Plan, true>> = {};

/** O que cada plano inclui (página de preços). Cada plano inclui também tudo o do anterior. */
export const PLAN_FEATURES: Record<Plan, string[]> = {
  menu: ["QR Code em cada lugar", "Ementa em 5 línguas, com fotos e alergénios", "Esgotados e preços mudados num minuto", "Cores e logótipo do restaurante"],
  orders: ["Pedidos na mesa, sem esperar", "Talão na cozinha e no bar", "\"Pedir a conta\" e \"Chamar empregado\"", "Painel da equipa em tempo real"],
  payments: ["Pagar no telemóvel: Apple Pay, MB WAY, cartão", "Gorjetas para a equipa", "Camas e espreguiçadeiras pagam ao pedir", "Dinheiro direto na conta do restaurante"],
};

