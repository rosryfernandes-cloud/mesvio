import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform/page-guard";
import { getEstablishmentDetail } from "@/server/platform/platform-service";
import { QrSheet } from "@/components/qr/qr-sheet";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "QR Codes" };

/** Folha de QR Codes de um restaurante (painel central): imprimir, rodar, desativar e reativar. */
export default async function EstablishmentQrPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const d = await getEstablishmentDetail(await getDb(), id);
  if (!d) notFound();
  return (
    <QrSheet
      title={`QR Codes · ${d.summary.name}`}
      back={{ href: `/central/restaurantes/${id}`, label: d.summary.name }}
      tables={d.tables}
      actionsEndpoint={(tableId) => `/api/central/mesas/${tableId}`}
      canDeactivate
    />
  );
}
