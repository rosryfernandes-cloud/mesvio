import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { getStaffContext } from "@/server/staff/http";
import { canUseExtra } from "@/server/extras/staff-gate";
import { KitchenView } from "@/components/staff/kitchen-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cozinha", robots: { index: false, follow: false } };

/** Ecrã da cozinha (extra): os pedidos por ordem de chegada, em letra grande, para um tablet na cozinha. */
export default async function KitchenPage() {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/painel/entrar");
  if (!(await canUseExtra(await getDb(), ctx, "cozinha"))) redirect("/painel");
  return <KitchenView establishmentName={ctx.establishmentName} />;
}
