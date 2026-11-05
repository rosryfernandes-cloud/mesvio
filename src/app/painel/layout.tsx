import { cookies } from "next/headers";
import { readSupportCookie, SUPPORT_COOKIE } from "@/server/platform/support";

/** Faixa do modo suporte, em todas as páginas do painel, para nunca se mexer no restaurante errado sem dar por isso. */
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const support = readSupportCookie((await cookies()).get(SUPPORT_COOKIE)?.value);
  return (
    <>
      {support && (
        <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-amber-400 px-4 py-2 text-sm font-semibold text-black print:hidden">
          <span>Modo suporte: {support.establishmentName}. As alterações ficam mesmo feitas neste restaurante.</span>
          <a href="/painel/suporte/terminar" className="rounded-lg bg-black px-3 py-1.5 text-white">
            Sair do modo suporte
          </a>
        </div>
      )}
      {children}
    </>
  );
}
