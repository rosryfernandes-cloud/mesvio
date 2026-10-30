import Link from "next/link";
import type { Metadata } from "next";
import { getDb } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform/page-guard";
import { getSecurityOverview } from "@/server/platform/passkeys";
import { CentralShell } from "@/components/central/central-shell";
import { SecuritySettings } from "@/components/central/security-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Segurança" };

export default async function SecurityPage() {
  const admin = await requirePlatformAdmin();
  const overview = await getSecurityOverview(await getDb(), admin);
  return (
    <CentralShell adminName={admin.displayName ?? admin.email ?? ""}>
      <Link prefetch={false} href="/central" className="text-sm text-ink-soft underline">
        ← Visão geral
      </Link>
      <h1 className="mt-3 text-3xl tracking-tight">Segurança</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-ink-soft">
        Formas de confirmar que é você ao entrar no painel central. Com o Face ID / Touch ID não precisa de códigos: a chave fica nas
        Palavras-passe do iCloud e serve no iPhone e no Mac.
      </p>
      <SecuritySettings initial={overview} />
    </CentralShell>
  );
}
