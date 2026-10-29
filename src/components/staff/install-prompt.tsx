"use client";

import { useEffect, useState } from "react";

const DISMISSED_KEY = "mesvio:instalar-fechado";

/** O evento do Chrome/Android que deixa abrir a janela "Instalar app" a partir de um botão. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * Aviso no painel para instalar o MESVIO no telemóvel (ícone no ecrã inicial, ecrã inteiro).
 * Só em telemóveis e tablets, nunca dentro da app já instalada, e cada pessoa pode fechá-lo.
 * Android: botão que abre a janela de instalação. iPhone: os dois toques no Safari.
 */
export function InstallPrompt() {
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {}
    if (standalone || !touch || dismissed) return;
    const ua = navigator.userAgent;
    // iPadOS identifica-se como Mac: distingue-se pelo ecrã tátil.
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    setPlatform(ios ? "ios" : "android");
    setHidden(false);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setHidden(true);
    setInstallEvent(null);
  }

  if (hidden || !platform) return null;
  return (
    <section aria-label="Instalar o MESVIO" className="mb-4 flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
      <svg viewBox="0 0 64 64" className="size-11 shrink-0" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#062D25" />
        <path d="M13 44V27.5a8.5 8.5 0 0 1 17 0V44M30 27.5a8.5 8.5 0 0 1 17 0V44" fill="none" stroke="#FFFFFF" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="53.5" cy="41.5" r="4.5" fill="#91E9C3" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Instale o MESVIO no telemóvel</p>
        {platform === "ios" ? (
          <p className="mt-1 text-sm text-ink-soft">
            No Safari, toque em <strong>Partilhar</strong>{" "}
            <svg viewBox="0 0 24 24" className="inline size-4 align-[-2px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="(ícone partilhar)">
              <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
            </svg>{" "}
            e depois em <strong>Adicionar ao ecrã principal</strong>. Abre direto no painel, como uma app.
          </p>
        ) : installEvent ? (
          <p className="mt-1 text-sm text-ink-soft">Fica com o ícone no ecrã inicial e abre direto no painel, como uma app.</p>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">
            No menu do browser <strong>⋮</strong>, toque em <strong>Instalar app</strong> (ou <strong>Adicionar ao ecrã principal</strong>).
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {installEvent && (
            <button type="button" onClick={install} className="min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white">
              Instalar
            </button>
          )}
          <button type="button" onClick={dismiss} className="min-h-10 rounded-xl border border-line bg-paper px-4 text-sm font-semibold">
            Agora não
          </button>
        </div>
      </div>
    </section>
  );
}
