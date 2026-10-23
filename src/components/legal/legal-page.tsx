import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LEGAL } from "@/lib/legal";

/** Moldura das páginas legais: legível, uma coluna, sem distrações. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="MESVIO — início" className="rounded-md">
            <Logo className="h-6 w-auto" />
          </Link>
          <nav aria-label="Documentos legais" className="flex gap-4 text-sm text-ink-soft">
            <Link href="/privacidade" className="hover:text-ink">
              Privacidade
            </Link>
            <Link href="/termos" className="hover:text-ink">
              Termos
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">Última atualização: {LEGAL.updatedAt}</p>
        <div className="legal mt-10 grid gap-8 leading-relaxed text-ink [&_h2]:text-xl [&_h2]:tracking-tight [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-brand [&_a]:underline">
          {children}
        </div>
      </main>
    </div>
  );
}
