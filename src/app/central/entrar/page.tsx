import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { authMode } from "@/server/auth/config";
import { getPlatformState } from "@/server/platform/admin-auth";
import { platformAdmins } from "@/server/db/schema";
import { DevLogin, EmailCodeLogin } from "@/components/staff/login-form";
import { Logo } from "@/components/brand/logo";
import { LogoutButton } from "@/components/central/logout-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar" };

export default async function CentralLoginPage() {
  const state = await getPlatformState();
  if (state.kind === "ok") redirect("/central");
  if (state.kind === "needs_mfa" || state.kind === "needs_enrollment") redirect("/central/2fa");
  const mode = authMode();
  const devAdmins =
    mode === "dev" && state.kind === "anonymous"
      ? (await (await getDb()).select().from(platformAdmins)).map((a) => ({
          userId: a.userId,
          email: a.email,
          displayName: a.displayName,
          role: "admin" as const,
        }))
      : [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <Logo className="h-7 w-auto self-start" />
      <h1 className="mt-8 text-3xl">Painel central</h1>
      <p className="mt-2 text-sm text-ink-soft">Gestão da plataforma MESVIO. Acesso só da equipa MESVIO, com 2FA.</p>
      {state.kind === "forbidden" ? (
        <div className="mt-8 grid gap-3">
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            Esta conta não tem acesso ao painel central.
          </p>
          <LogoutButton className="text-sm text-ink-soft underline" />
        </div>
      ) : (
        <>
          {mode === "supabase" && <EmailCodeLogin redirectTo="/central/2fa" hint="Só para administradores da plataforma." />}
          {mode === "dev" && <DevLogin users={devAdmins} redirectTo="/central/2fa" />}
          {mode === "unavailable" && (
            <p role="alert" className="mt-8 rounded-xl bg-ink px-4 py-3 text-sm text-paper">
              A autenticação não está configurada neste servidor.
            </p>
          )}
        </>
      )}
    </main>
  );
}
