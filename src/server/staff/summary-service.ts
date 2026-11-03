import "server-only";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { establishments, orderEvents, orderItems, orders } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import { startOfLocalDay } from "@/server/orders/place-order";
import type { StaffScope } from "./staff-service";

/** Pedidos que contam como venda: chegaram à cozinha (os recusados, cancelados ou por pagar não contam). */
const SOLD = ["ACCEPTED", "IN_PREPARATION", "SERVED"] as const;

export interface DaySummary {
  orders: number;
  salesCents: number;
  averageTicketCents: number;
  /** Segundos, em média, entre o cliente enviar o pedido e ele chegar à cozinha; null sem dados. */
  secondsToKitchen: number | null;
  /** Pedidos por hora local (0–23), só as horas com pedidos. */
  byHour: { hour: number; orders: number }[];
  topProducts: { name: string; quantity: number }[];
}

/** Resumo do dia de hoje (no fuso do restaurante) para o painel do dono/gerente. */
export async function getDaySummary(root: Db, s: StaffScope, now = new Date()): Promise<DaySummary> {
  return withTenant(root, { organizationId: s.organizationId, userId: s.userId }, async (db) => {
    const [est] = await db.select({ timezone: establishments.timezone }).from(establishments).where(eq(establishments.id, s.establishmentId));
    const where = and(
      eq(orders.organizationId, s.organizationId),
      eq(orders.establishmentId, s.establishmentId),
      gte(orders.createdAt, startOfLocalDay(now, est.timezone)),
      inArray(orders.status, [...SOLD]),
    );
    const sold = await db.select({ id: orders.id, createdAt: orders.createdAt, totalCents: orders.totalGrossCents }).from(orders).where(where);
    const ids = sold.map((o) => o.id);
    const salesCents = sold.reduce((sum, o) => sum + o.totalCents, 0);

    const [arrivals, top] = ids.length
      ? await Promise.all([
          db
            .select({ orderId: orderEvents.orderId, at: sql<Date>`min(${orderEvents.createdAt})` })
            .from(orderEvents)
            .where(and(inArray(orderEvents.orderId, ids), inArray(orderEvents.toStatus, ["SUBMITTED", "ACCEPTED"])))
            .groupBy(orderEvents.orderId),
          db
            .select({ name: orderItems.name, quantity: sql<number>`sum(${orderItems.quantity})::int` })
            .from(orderItems)
            .where(inArray(orderItems.orderId, ids))
            .groupBy(orderItems.name)
            .orderBy(sql`sum(${orderItems.quantity}) desc`, asc(orderItems.name))
            .limit(5),
        ])
      : [[], []];

    const createdAt = new Map(sold.map((o) => [o.id, o.createdAt.getTime()]));
    const waits = arrivals
      .map((a) => (new Date(a.at).getTime() - (createdAt.get(a.orderId) ?? 0)) / 1000)
      .filter((sec) => sec >= 0);
    const hourOf = new Intl.DateTimeFormat("en-GB", { timeZone: est.timezone, hour: "2-digit", hourCycle: "h23" });
    const perHour = new Map<number, number>();
    for (const o of sold) {
      const h = Number(hourOf.format(o.createdAt));
      perHour.set(h, (perHour.get(h) ?? 0) + 1);
    }

    return {
      orders: sold.length,
      salesCents,
      averageTicketCents: sold.length ? Math.round(salesCents / sold.length) : 0,
      secondsToKitchen: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
      byHour: [...perHour].sort(([a], [b]) => a - b).map(([hour, n]) => ({ hour, orders: n })),
      topProducts: top.map((t) => ({ name: t.name, quantity: Number(t.quantity) })),
    };
  });
}
