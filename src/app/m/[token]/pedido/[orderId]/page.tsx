import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db/client";
import { getOrderForTable } from "@/server/orders/order-view";
import { OrderStatus } from "@/components/order/order-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "O seu pedido", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string; orderId: string }>; searchParams: Promise<{ pagar?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const { token, orderId } = await params;
  const { pagar } = await searchParams;
  const order = await getOrderForTable(await getDb(), token, orderId);
  if (!order) notFound();
  return <OrderStatus initial={order} tableToken={token} autoPay={pagar === "1"} />;
}
