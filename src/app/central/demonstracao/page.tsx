import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/platform/page-guard";
import { CentralShell } from "@/components/central/central-shell";
import { QuickDemo } from "@/components/central/quick-demo";
import { PreviewList } from "@/components/central/preview-list";
import { BatchPreviews } from "@/components/central/batch-previews";
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
        Cole o link da ementa do restaurante (página do site ou PDF), ou fotografe-a, e mostre ao dono a ementa digital dele, em 5 línguas, em menos de um minuto. Pode
        também criar um link privado para lhe enviar por email, WhatsApp ou Instagram. Para o restaurante passar a cliente, crie-o em
        &quot;Novo restaurante&quot;.
      </p>
      <QuickDemo />
      <BatchPreviews />
      <section aria-labelledby="enviadas" className="mt-10">
        <h2 id="enviadas" className="text-xl">
          Links enviados
        </h2>
        <p className="mt-1 text-sm text-ink-soft">Quem pediu para ativar aparece primeiro, depois quem abriu. Ligue a quem abriu há pouco.</p>
        <p className="mt-1 text-sm text-ink-soft">
          &quot;Enviar pelo Gmail&quot; abre um email já com o destinatário e o assunto e copia a mensagem formatada: no Gmail cole (Cmd+V),
          confirme que o remetente é geral@mesvio.pt e envie. &quot;Copiar email&quot; só copia a mensagem. &quot;WhatsApp / Instagram&quot; copia
          uma mensagem curta. Envie do seu email ou telemóvel, a poucos restaurantes por dia e só para contactos de empresa.
        </p>
        <PreviewList
          baseUrl={baseUrl}
          sender={(admin.displayName ?? "Rodrigo").split(" ")[0]}
          rows={previews.map(({ firstViewedAt: _first, ...p }) => ({
            ...p,
            emailedAt: p.emailedAt?.toISOString() ?? null,
            followedUpAt: p.followedUpAt?.toISOString() ?? null,
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
