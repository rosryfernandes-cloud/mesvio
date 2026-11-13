import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/server/db/client";
import { getPreviewByToken } from "@/server/platform/menu-previews";
import { MenuPreviewView } from "@/components/preview/menu-preview";
import { PoweredBy } from "@/components/brand/logo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const p = await getPreviewByToken(await getDb(), token);
  return { title: p ? `${p.restaurantName} — ementa digital` : "Pré-visualização", robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Pré-visualização privada da ementa de um potencial cliente, preparada pela equipa MESVIO. */
export default async function PreviewPage({ params }: Props) {
  const { token } = await params;
  const p = await getPreviewByToken(await getDb(), token);
  if (!p) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6 text-center">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">Este link expirou</h1>
          <p className="mt-3 text-ink-soft">
            A pré-visualização já não está disponível. Fale connosco e preparamos outra com a sua ementa.
          </p>
          <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 font-semibold text-white">
            Conhecer a MESVIO
          </Link>
        </div>
      </main>
    );
  }
  return (
    <>
      <MenuPreviewView token={token} restaurantName={p.restaurantName} menu={p.menu} translations={p.translations} />
      <footer className="mx-auto max-w-2xl px-4 pb-10 text-center text-xs text-ink-soft">
        <PoweredBy label="Preparado por" />
      </footer>
    </>
  );
}
