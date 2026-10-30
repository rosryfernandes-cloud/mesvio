import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { diningTables, establishments, orderItems, orders, orderStatus, payments } from "@/server/db/schema";
import { effectiveOrderingMode } from "@/lib/plan";
import { isWellFormedTableToken } from "@/server/tables/table-token";
import { resolveTableToken, withTenant } from "@/server/db/tenant";
import { loadMenuTranslations, untranslated, type MenuTranslator } from "@/server/menu/menu-translations";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/messages";

export type OrderStatus = (typeof orderStatus.enumValues)[number];

/** Forma do pedido devolvida ao cliente: sem refs internas do POS. */
export interface OrderView {
  id: string;
  shortCode: string;
  tableLabel: string;
  /** "pay_first": pago na app antes de seguir para a cozinha (espreguiçadeiras). */
  orderingMode: "pay_later" | "pay_first";
  status: OrderStatus;
  lines: { name: string; quantity: number; modifierNames: string[]; notes?: string; lineTotalCents: number }[];
  notes?: string;
  totalCents: number;
  createdAt: string;
  /**
   * Lugares que pagam ao pedir: o cliente pode pedir fatura depois de pagar, se o restaurante tiver
   * a faturação ligada. `status` = estado da fatura pedida (null = ainda não pediu).
   */
  invoice?: { status: "pending" | "issued" | "failed" | "manual" | null };
}

export async function loadOrderView(db: Db, orderId: string, tr: MenuTranslator = untranslated): Promise<OrderView | null> {
  const [o] = await db
    .select({
      id: orders.id,
      shortCode: orders.shortCode,
      status: orders.status,
      notes: orders.notes,
      totalCents: orders.totalGrossCents,
      createdAt: orders.createdAt,
      tableLabel: diningTables.label,
      mode: diningTables.orderingMode,
      plan: establishments.plan,
      invoicing: sql<boolean>`${establishments.invoicingAccount} is not null and ${establishments.invoicingApiKeyCiphertext} is not null`,
    })
    .from(orders)
    .innerJoin(diningTables, eq(diningTables.id, orders.tableId))
    .innerJoin(establishments, eq(establishments.id, diningTables.establishmentId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!o) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.lineNo));
  const { mode, plan, invoicing, ...rest } = o;
  const orderingMode = effectiveOrderingMode(plan, mode);
  // Pago ao pedir: a fatura pede-se sobre o pagamento confirmado deste pedido.
  let invoice: OrderView["invoice"];
  if (orderingMode === "pay_first" && invoicing) {
    const [p] = await db
      .select({ status: payments.invoiceStatus })
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.status, "SUCCEEDED")))
      .limit(1);
    if (p) invoice = { status: p.status };
  }
  return {
    ...rest,
    orderingMode,
    invoice,
    notes: o.notes ?? undefined,
    createdAt: o.createdAt.toISOString(),
    lines: items.map((i) => ({
      name: tr("product", i.posProductRef, i.name).name,
      quantity: i.quantity,
      modifierNames: i.modifiers.map((m) => tr("modifier", m.posModifierRef, m.name).name),
      notes: i.notes ?? undefined,
      lineTotalCents: i.lineGrossCents,
    })),
  };
}

/** Só devolve o pedido a quem tem o token da mesa onde foi feito. */
export async function getOrderForTable(
  db: Db,
  tableToken: string,
  orderId: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<OrderView | null> {
  if (!isWellFormedTableToken(tableToken) || !z.uuid().safeParse(orderId).success) return null;
  const table = await resolveTableToken(db, tableToken);
  if (!table) return null;
  const tr = await loadMenuTranslations(db, table.organizationId, table.establishmentId, locale);
  return withTenant(db, { organizationId: table.organizationId }, async (tx) => {
    const [match] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tableId, table.tableId)))
      .limit(1);
    return match ? loadOrderView(tx, match.id, tr) : null;
  });
}
