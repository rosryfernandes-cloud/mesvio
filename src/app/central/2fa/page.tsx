import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { activationRequired, getPlatformState } from "@/server/platform/admin-auth";
import { Logo } from "@/components/brand/logo";
import { TwoFactorChallenge, TwoFactorSetup } from "@/components/central/two-factor";
import { LogoutButton } from "@/components/central/logout-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verificação em dois passos" };

export default async function TwoFactorPage() {
  const state = await getPlatformState();
  if (state.kind === "anonymous") redirect("/central/entrar");
  if (state.kind === "forbidden") notFound();
  if (state.kind === "ok") redirect("/central");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <Logo className="h-7 w-auto self-start" />
      {state.kind === "needs_enrollment" ? <TwoFactorSetup needsActivationCode={activationRequired()} /> : <TwoFactorChallenge />}
      <LogoutButton className="mt-8 self-start text-sm text-ink-soft underline" />
    </main>
  );
}
