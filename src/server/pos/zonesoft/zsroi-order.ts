import type { PosOrderRequest, PosOrderResult } from "../types";
import type { ZoneSoftCredentials } from "./zsroi-auth";

/**
 * Pedido MESVIO → formato ZSROI (`POST /v1.0/integration/order`), conforme o manual "Generic Integration"
 * e o ficheiro example_order.txt do portal.
 *
 * A ZSROI só aceita `type_order` DELIVERY ou PICKUP e não tem campo de mesa. Até a ZoneSoft indicar o campo
 * certo, o pedido vai como PICKUP e a mesa segue no nome do cliente, na morada e nas observações, para a
 * cozinha a ver no talão. Os campos de estafeta e morada são obrigatórios na API e vão preenchidos com a mesa.
 */

export const ZSROI_ORDER_URL = "https://zsroi.zonesoft.org/v1.0/integration/order";

/** Data e hora de Lisboa no formato da ZSROI: "yyyy-MM-dd HH:mm:ss". */
export function lisbonTime(d: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function buildZsroiOrder(order: PosOrderRequest, creds: ZoneSoftCredentials, now: Date, opts: { paid?: boolean } = {}) {
  const table = order.tableLabel?.trim() || `Mesa ${order.posTableRef}`;
  const products = order.lines.map((l) => {
    const deltas = l.modifiers.reduce((s, m) => s + (m.priceDeltaCents ?? 0), 0);
    return {
      id: l.posProductRef,
      quantity: l.quantity,
      name: l.name ?? l.posProductRef,
      // O preço unitário da MESVIO já inclui as opções; na ZSROI cada opção leva o seu preço.
      price: l.unitPriceCents - deltas,
      discount: 0,
      obs: l.notes ?? "",
      attributes: l.modifiers.map((m) => ({
        id: m.posModifierRef,
        quantity: 1,
        name: m.name ?? m.posModifierRef,
        price: m.priceDeltaCents ?? 0,
        discount: 0,
        obs: "",
      })),
    };
  });
  const total = order.lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const obs = [`${table.toUpperCase()} · MESVIO`, order.notes].filter(Boolean).join(" · ");
  return {
    order_id: order.externalOrderId,
    store_id: creds.clientId || creds.storeId,
    type_order: "PICKUP",
    order_time: lisbonTime(now),
    estimated_pickup_time: lisbonTime(new Date(now.getTime() + 15 * 60_000)),
    currency: "EUR",
    delivery_fee: 0,
    estimated_total_price: total,
    courier: { name: "MESVIO", phone_number: "", license_plate: table },
    customer: { name: table, phone_number: "", nif: "", email: "" },
    products,
    obs,
    orderIsAlreadyPaid: opts.paid ?? false,
    delivery_address: { label: table, latitude: "0", longitude: "0" },
    is_picked_up_by_customer: true,
    discounted_products_total: 0,
    total_customer_to_pay: total,
    channel_name: "#MESVIO#MESA",
    payment_charges: {
      total,
      sub_total: 0,
      tax: 0,
      total_fee: 0,
      total_fee_tax: 0,
      bag_fee: 0,
      delivery_fee: 0,
      delivery_fee_tax: 0,
      small_order_fee: 0,
      small_order_fee_tax: 0,
      pick_and_pack_fee: 0,
      pick_and_pack_fee_tax: 0,
      tip: 0,
    },
  };
}

/** Motivos de recusa da ZSROI → texto para o staff. */
const REJECTIONS: [RegExp, string][] = [
  [/pos_ping_failed/, "O POS ZoneSoft está desligado ou sem ligação."],
  [/menu_not_found/, "A ementa ainda não foi sincronizada no ZS Rest (Sync Menus)."],
  [/unknown_items/, "Há artigos que o ZS Rest não conhece: volte a sincronizar a ementa."],
  [/missing_integration_service/, "A integração ainda não está ativa na ZoneSoft."],
  [/bad_structure/, "A ZoneSoft recusou o formato do pedido."],
];

/** Resposta HTTP da ZSROI → resultado comum dos POS. */
export function interpretZsroiResponse(status: number, body: unknown): PosOrderResult {
  const response = (body as { Response?: { StatusCode?: number; Content?: unknown } } | null)?.Response;
  const code = response?.StatusCode ?? status;
  const content = typeof response?.Content === "string" ? response.Content : "";
  if (code === 201 || code === 200 || code === 204) return { outcome: "submitted" };
  if (code === 422) {
    const known = REJECTIONS.find(([re]) => re.test(content));
    return { outcome: "rejected", reason: known ? `${known[1]} (${content})` : `Recusado pela ZoneSoft: ${content || "422"}` };
  }
  if (code === 400) return { outcome: "rejected", reason: "A ZoneSoft recusou o pedido (dados em falta)." };
  if (code === 401 || code === 403) return { outcome: "rejected", reason: "A ZoneSoft recusou as credenciais da integração." };
  if (code === 429) return { outcome: "retryable_error", reason: "A ZoneSoft pediu para esperar (demasiados pedidos)." };
  // 5xx ou outra resposta: a ZoneSoft pode ter guardado o pedido.
  return { outcome: "unknown", reason: `Resposta inesperada da ZoneSoft (${status}).` };
}
