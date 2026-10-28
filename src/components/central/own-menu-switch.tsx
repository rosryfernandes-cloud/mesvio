"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const NAMES: Record<string, string> = { mock: "MockPOS (testes)", zonesoft: "ZoneSoft", mesvio: "Sem POS — ementa MESVIO" };

/** Ementa do restaurante: vem do POS ou é gerida na MESVIO (sem POS, talão na cozinha). */
export function OwnMenuSwitch({ establishmentId, provider }: { establishmentId: string; provider: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function switchNow() {
    setBusy(true);
    const res = await fetch(`/api/central/restaurantes/${establishmentId}/ementa`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    setConfirming(false);
    if (!res?.ok) return setMessage({ text: data.message ?? "Não foi possível mudar.", error: true });
    setMessage({ text: `Feito: ${data.products ?? 0} pratos copiados. O dono já pode editar a ementa no painel (separador Ementa).`, error: false });
    router.refresh();
  }

  return (
    <section aria-labelledby="ementa" className="mt-6 rounded-3xl border border-line bg-card p-5">
      <h2 id="ementa" className="text-lg">
        Ementa e POS
      </h2>
      <p className="mt-1 text-sm">
        Atual: <strong>{NAMES[provider] ?? provider}</strong>
      </p>
      {provider === "mesvio" ? (
        <p className="mt-2 text-sm text-ink-soft">O dono gere os pratos e preços no painel (separador Ementa). Os pedidos saem em talão na cozinha.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-soft">
            Sem integração POS ligada? Passe para a ementa MESVIO: a ementa atual é copiada (com fotos, traduções e esgotados), o dono
            passa a editá-la no painel, e os pedidos ficam confirmados de imediato e saem em talão na cozinha.
          </p>
          {confirming ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Passar para sem POS?</span>
              <button type="button" disabled={busy} onClick={switchNow} className="min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? "A copiar…" : "Sim, passar"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="min-h-10 rounded-xl border border-line px-4 text-sm">
                Voltar
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="mt-3 min-h-10 rounded-xl border border-brand px-4 text-sm font-semibold text-brand">
              Passar para ementa MESVIO (sem POS)
            </button>
          )}
        </>
      )}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-3 rounded-xl px-4 py-3 text-sm ${message.error ? "bg-danger-soft text-danger" : "bg-[#ecfdf3] text-ok"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
