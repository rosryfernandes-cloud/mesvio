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
  menu: "Os clientes veem a ementa pelo QR (fotos, inglês, alergénios). Não pedem pela app.",
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
