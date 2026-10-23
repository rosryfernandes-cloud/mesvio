import "server-only";
import { notFound, redirect } from "next/navigation";
import { getPlatformState, type PlatformAdmin } from "./admin-auth";

/**
 * Para as páginas do painel central: sem sessão → entrar; sem 2FA verificado → /central/2fa;
 * quem não é administrador vê "não encontrado" (o painel não se anuncia).
 */
export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const state = await getPlatformState();
  if (state.kind === "anonymous") redirect("/central/entrar");
  if (state.kind === "forbidden") notFound();
  if (state.kind !== "ok") redirect("/central/2fa");
  return state.admin;
}
