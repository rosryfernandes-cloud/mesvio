import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { diningTables } from "@/server/db/schema";
import { can } from "@/server/staff/context";
import { getStaffContext } from "@/server/staff/http";
import { QrSheet } from "@/components/qr/qr-sheet";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "QR Codes", robots: { index: false, follow: false } };

/** QR Codes do restaurante (dono/gerente): imprimir e gerar QR novos. */
export default async function StaffQrPage() {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/painel/entrar");
  if (!can(ctx, "settings.edit")) notFound();
  const tables = await withTenant(await getDb(), { organizationId: ctx.organizationId, userId: ctx.userId }, (tx) =>
    tx
      .select({ id: diningTables.id, label: diningTables.label, publicToken: diningTables.publicToken, active: diningTables.active })
      .from(diningTables)
      .where(eq(diningTables.establishmentId, ctx.establishmentId))
      .orderBy(asc(diningTables.label)),
  );
  const natural = new Intl.Collator("pt", { numeric: true });
  const name = ctx.establishments.find((e) => e.id === ctx.establishmentId)?.name ?? "Restaurante";
  return (
    <QrSheet
      title={`QR Codes · ${name}`}
      back={{ href: "/painel", label: "Painel" }}
      tables={tables.sort((a, b) => natural.compare(a.label, b.label))}
      actionsEndpoint={(id) => `/api/painel/mesas/${id}`}
      canDeactivate={false}
    />
  );
}
