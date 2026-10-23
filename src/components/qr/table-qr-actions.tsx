"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "rotate_qr" | "deactivate" | "activate";
const LABEL: Record<Action, string> = { rotate_qr: "Novo QR Code", deactivate: "Desativar", activate: "Reativar" };
const CONFIRM: Record<Action, string> = {
  rotate_qr: "O QR atual deixa de funcionar já. Tem de imprimir e colocar o novo. Continuar?",
  deactivate: "Este lugar deixa de aceitar pedidos e o QR deixa de abrir a ementa. Continuar?",
  activate: "",
};

/** Botões de um lugar na folha de QR (não aparecem na impressão). */
export function TableQrActions({ endpoint, actions }: { endpoint: string; actions: Action[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    setBusy(true);
    setError(null);
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    setBusy(false);
    setConfirming(null);
    if (!res?.ok) return setError("Não foi possível. Tente de novo.");
    router.refresh();
  }

  return (
    <div className="mt-3 w-full print:hidden">
      {confirming ? (
        <div className="grid gap-2 rounded-xl bg-amber-50 p-2 text-left text-xs text-amber-900">
          <p>{CONFIRM[confirming]}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => run(confirming)} className="min-h-9 rounded-lg bg-brand px-3 font-semibold text-white">
              {busy ? "…" : "Sim"}
            </button>
            <button type="button" onClick={() => setConfirming(null)} className="min-h-9 px-2 underline">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              disabled={busy}
              onClick={() => (CONFIRM[a] ? setConfirming(a) : run(a))}
              className="min-h-9 rounded-lg border border-line px-3 text-xs font-semibold hover:border-brand"
            >
              {LABEL[a]}
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
