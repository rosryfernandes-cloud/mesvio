import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { authMode } from "@/server/auth/config";
import { listDevUsers } from "@/server/auth/dev-users";
import { getStaffContext } from "@/server/staff/http";
import { DevLogin, EmailCodeLogin } from "@/components/staff/login-form";
import { Logo } from "@/components/brand/logo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar no painel", robots: { index: false, follow: false } };

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (await getStaffContext()) redirect("/painel");
  const { erro } = await searchParams;
  const mode = authMode();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <Logo className="h-7 w-auto self-start" />
      <h1 className="mt-8 font-[family-name:var(--font-display)] text-3xl">Painel do restaurante</h1>
      <p className="mt-2 text-sm text-ink-soft">Pedidos em tempo real, aprovações, esgotados e equipa.</p>
      {erro === "link" && (
        <p role="alert" className="mt-6 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          O link expirou ou já foi usado. Entre com o seu email.
        </p>
      )}
      {mode === "supabase" && <EmailCodeLogin />}
      {mode === "dev" && <DevLogin users={(await listDevUsers(await getDb())).map(({ organizationId, ...u }) => u)} />}
      {mode === "unavailable" && (
        <p role="alert" className="mt-8 rounded-xl bg-ink px-4 py-3 text-sm text-paper">
          A autenticação não está configurada neste servidor.
        </p>
      )}
    </main>
  );
}
