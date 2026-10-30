import type { Metadata } from "next";
import { getDb } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform/page-guard";
import { listDemoRequests } from "@/server/contact/demo-requests";
import { CentralShell } from "@/components/central/central-shell";
import { DemoRequestsBoard } from "@/components/central/demo-requests-board";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pedidos de demonstração" };

export default async function DemoRequestsPage() {
  const admin = await requirePlatformAdmin();
  const rows = await listDemoRequests(await getDb());
  return (
    <CentralShell adminName={admin.displayName ?? admin.email ?? ""}>
      <a href="/central" className="text-sm text-ink-soft underline">
        ← Visão geral
      </a>
      <h1 className="mt-3 text-3xl tracking-tight">Pedidos de demonstração</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-ink-soft">
        Quem pediu uma demonstração no site. Cada pessoa recebe logo um email a dizer que vamos entrar em contacto; marque aqui em que ponto
        está cada uma.
      </p>
      <DemoRequestsBoard
        initial={rows.map((r) => ({
          id: r.id,
          name: r.name,
          business: r.business,
          email: r.email,
          phone: r.phone,
          venueType: r.venueType,
          message: r.message,
          status: r.status,
          notes: r.notes,
          createdAt: r.createdAt.toISOString(),
          confirmationSent: r.confirmationSentAt !== null,
        }))}
      />
    </CentralShell>
  );
}
