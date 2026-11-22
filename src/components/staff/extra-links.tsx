"use client";

import { useState } from "react";

/** Painel → "TV e site": os links dos extras Ementa na TV e Site do restaurante, para abrir ou partilhar. */
export function ExtraLinks({ extras, tv, site }: { extras: { tvToken?: string; siteToken?: string }; tv: boolean; site: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const items = [
    tv && {
      key: "tv",
      title: "Ementa na TV",
      text: "Abra este link na TV do restaurante (no browser da TV, num Chromecast ou num computador ligado à TV) e ponha em ecrã inteiro. O menu do dia e a ementa passam sozinhos e atualizam-se quando muda alguma coisa no painel.",
      url: extras.tvToken ? `${origin}/tv/${extras.tvToken}` : null,
    },
    site && {
      key: "site",
      title: "Site do restaurante",
      text: "Uma página com a ementa, o menu do dia, o horário e a morada. Ponha o link no Instagram, no Google (Perfil da Empresa) e no WhatsApp.",
      url: extras.siteToken ? `${origin}/r/${extras.siteToken}` : null,
    },
  ].filter(Boolean) as { key: string; title: string; text: string; url: string | null }[];

  return (
    <div className="grid gap-4">
      {items.map((it) => (
        <section key={it.key} className="grid gap-2 rounded-3xl border border-line bg-card p-5">
          <h2 className="text-xl">{it.title}</h2>
          <p className="text-sm text-ink-soft">{it.text}</p>
          {it.url ? (
            <>
              <code className="block rounded-xl bg-paper px-3 py-2 text-sm break-all">{it.url}</code>
              <div className="flex flex-wrap gap-2">
                <a href={it.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 font-semibold text-white">
                  Abrir
                </a>
                <button
                  type="button"
                  className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-semibold"
                  onClick={() =>
                    void navigator.clipboard.writeText(it.url!).then(
                      () => setCopied(it.key),
                      () => window.prompt("Copie o link:", it.url!),
                    )
                  }
                >
                  {copied === it.key ? "Copiado ✓" : "Copiar link"}
                </button>
              </div>
            </>
          ) : (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm">Este extra ainda não está ligado. A MESVIO liga-o na Central e o link aparece aqui.</p>
          )}
        </section>
      ))}
    </div>
  );
}
