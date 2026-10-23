import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getOrderForTable } from "@/server/orders/order-view";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get("mesa") ?? "";
  const order = await getOrderForTable(await getDb(), token, id);
  if (!order) {
    return NextResponse.json({ code: "NOT_FOUND", message: "Pedido não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ order }, { headers: { "Cache-Control": "no-store" } });
}
