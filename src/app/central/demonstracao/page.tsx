import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/platform/page-guard";
import { CentralShell } from "@/components/central/central-shell";
import { QuickDemo } from "@/components/central/quick-demo";
import { PreviewList } from "@/components/central/preview-list";
import { getDb } from "@/server/db/client";
import { readWithRetry } from "@/server/db/read-retry";
import { listPreviews } from "@/server/platform/menu-previews";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demonstração rápida" };

export default async function DemoPage() {
  const admin = await requirePlatformAdmin();
  const db = await getDb();
  const previews = await readWithRetry(() => listPreviews(db));
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://mesvio.pt").replace(/\/+$/, "");
  return (
    <CentralShell adminName={admin.displayName ?? admin.email ?? ""}>
      <h1 className="text-3xl tracking-tight">Demonstração rápida</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Fotografe a ementa do restaurante (ou use o PDF) e mostre ao dono a ementa digital dele, em 5 línguas, em menos de um minuto. Pode
        também criar um link privado para lhe enviar por email, WhatsApp ou Instagram. Para o restaurante passar a cliente, crie-o em
        &quot;Novo restaurante&quot;.
      </p>
      <QuickDemo />
      <section aria-labelledby="enviadas" className="mt-10">
        <h2 id="enviadas" className="text-xl">
          Links enviados
        </h2>
        <p className="mt-1 text-sm text-ink-soft">Quem pediu para ativar aparece primeiro, depois quem abriu. Ligue a quem abriu há pouco.</p>
        <p className="mt-1 text-sm text-ink-soft">
          &quot;Copiar email&quot; copia a mensagem já formatada, com imagens: cole no Gmail e copie também o assunto. &quot;WhatsApp / Instagram&quot; copia
          uma mensagem curta. Envie do seu email ou telemóvel, a poucos restaurantes por dia e só para contactos de empresa.
        </p>
        <PreviewList
          baseUrl={baseUrl}
          sender={(admin.displayName ?? "Rodrigo").split(" ")[0]}
          rows={previews.map(({ firstViewedAt: _first, ...p }) => ({
            ...p,
            createdAt: p.createdAt.toISOString(),
            expiresAt: p.expiresAt.toISOString(),
            lastViewedAt: p.lastViewedAt?.toISOString() ?? null,
            activationRequestedAt: p.activationRequestedAt?.toISOString() ?? null,
          }))}
        />
      </section>
    </CentralShell>
  );
}
