import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LogoutButton } from "./logout-button";

/**
 * Cabeçalho do painel central (só depois do 2FA). A "Visão geral" é um link normal (carrega a
 * página do zero): a navegação do Next podia reaproveitar um redirecionamento antigo para o 2FA.
 */
export function CentralShell({ adminName, children }: { adminName: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="on-dark bg-brand text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <a href="/central" aria-label="Painel central — início" className="rounded-md">
              <Logo variant="dark" className="h-6 w-auto" />
            </a>
            <span className="rounded-full border border-white/20 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-mint uppercase">Central</span>
          </div>
          <nav aria-label="Painel central" className="flex flex-wrap items-center gap-1 text-sm">
            <a href="/central" className="rounded-lg px-3 py-2 text-white/85 hover:text-white">
              Visão geral
            </a>
            <a href="/central/pedidos" className="rounded-lg px-3 py-2 text-white/85 hover:text-white">
              Pedidos de demo
            </a>
            <a href="/central/seguranca" className="rounded-lg px-3 py-2 text-white/85 hover:text-white">
              Segurança
            </a>
            <Link href="/central/restaurantes/novo" className="rounded-full bg-mint px-4 py-2 font-semibold text-brand hover:bg-white">
              Novo restaurante
            </Link>
            <span className="hidden px-2 text-white/70 sm:inline">{adminName}</span>
            <LogoutButton className="rounded-lg px-3 py-2 text-white/85 hover:text-white" />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
