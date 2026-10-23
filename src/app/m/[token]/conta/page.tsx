import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db/client";
import { getTableBillByToken } from "@/server/tables/table-sessions";
import { TableBillView } from "@/components/order/table-bill";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conta da mesa", robots: { index: false, follow: false } };

export default async function TableBillPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bill = await getTableBillByToken(await getDb(), token);
  if (!bill) notFound();
  return <TableBillView initial={bill} tableToken={token} />;
}
