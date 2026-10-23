import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db/client";
import { getTableBillByToken } from "@/server/tables/table-sessions";
import { TableBillView } from "@/components/order/table-bill";
import { getRequestLocale } from "@/server/i18n/request-locale";
import { MESSAGES } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: MESSAGES[await getRequestLocale()].bill.title, robots: { index: false, follow: false } };
}

export default async function TableBillPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bill = await getTableBillByToken(await getDb(), token, new Date(), await getRequestLocale());
  if (!bill) notFound();
  return <TableBillView initial={bill} tableToken={token} />;
}
