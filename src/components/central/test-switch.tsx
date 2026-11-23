"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Marca o restaurante como de teste: passa para a aba "Teste" da Central e deixa de contar nos números e nos alertas. */
export function TestSwitch({ establishmentId, isTest }: { establishmentId: string; isTest: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(isTest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/central/restaurantes/${establishmentId}/teste`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isTest: !on }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("Não foi possível mudar. Tente outra vez.");
    setOn(!on);
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy}
        onClick={() => void toggle()}
        className={`flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold disabled:opacity-60 ${on ? "border-amber-500 bg-amber-50 text-amber-900" : "border-line bg-card"}`}
      >
        <span aria-hidden="true" className={`relative h-5 w-9 rounded-full transition ${on ? "bg-amber-500" : "bg-line"}`}>
          <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${on ? "left-4.5" : "left-0.5"}`} />
        </span>
        Restaurante de teste
      </button>
      <span className="text-xs text-ink-soft">{on ? "Está na aba Teste e não conta nos números nem nos alertas." : "Conta como cliente real."}</span>
      {error && <span role="alert" className="text-sm text-danger">{error}</span>}
    </div>
  );
}
