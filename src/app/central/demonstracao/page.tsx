import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/platform/page-guard";
import { CentralShell } from "@/components/central/central-shell";
import { QuickDemo } from "@/components/central/quick-demo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demonstração rápida" };

export default async function DemoPage() {
  const admin = await requirePlatformAdmin();
  return (
    <CentralShell adminName={admin.displayName ?? admin.email ?? ""}>
      <h1 className="text-3xl tracking-tight">Demonstração rápida</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Fotografe a ementa do restaurante e mostre ao dono a ementa digital dele, em 5 línguas, em menos de um minuto. Não fica nada
        guardado: para o restaurante passar a cliente, crie-o em &quot;Novo restaurante&quot;.
      </p>
      <QuickDemo />
    </CentralShell>
  );
}
