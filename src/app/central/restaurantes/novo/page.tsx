import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/platform/page-guard";
import { CentralShell } from "@/components/central/central-shell";
import { CreateRestaurantForm } from "@/components/central/create-restaurant-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Novo restaurante" };

export default async function NewRestaurantPage() {
  const admin = await requirePlatformAdmin();
  return (
    <CentralShell adminName={admin.displayName ?? admin.email ?? ""}>
      <a href="/central" className="text-sm text-ink-soft underline">
        ← Visão geral
      </a>
      <h1 className="mt-3 text-3xl tracking-tight">Novo restaurante</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-ink-soft">
        Cria o cliente, os lugares com QR Code e convida o dono. Depois é só imprimir os QR Codes e o dono trata da equipa e da
        aparência da ementa no painel dele.
      </p>
      <CreateRestaurantForm />
    </CentralShell>
  );
}
