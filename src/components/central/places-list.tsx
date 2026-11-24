"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Place = { id: string; label: string; zone: string | null; orderingMode: string; publicToken: string; active: boolean };

const MODE: Record<string, string> = { pay_first: "Paga ao pedir", menu_only: "Só ementa", pay_later: "Paga no fim" };

/**
 * Lugares do restaurante por zona. "Gerir" mostra os botões para retirar um lugar (o QR deixa de abrir)
 * ou repô-lo (volta com o mesmo QR, as placas impressas continuam a servir).
 */
export function PlacesList({ establishmentId, tables }: { establishmentId: string; tables: Place[] }) {
  const router = useRouter();
  const [managing, setManaging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const zones = [...new Set(tables.map((t) => t.zone ?? "Sem zona"))];

  async function toggle(t: Place) {
    if (t.active && !window.confirm(`Retirar "${t.label}"? O QR deste lugar deixa de abrir a ementa. Pode repô-lo depois, com o mesmo QR.`)) return;
    setBusy(t.id);
    setMessage(null);
    const res = await fetch(`/api/central/restaurantes/${establishmentId}/mesas/${t.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !t.active }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setMessage({ text: "Não foi possível mudar. Tente outra vez.", error: true });
    setMessage({ text: t.active ? `"${t.label}" retirado. O QR já não abre a ementa.` : `"${t.label}" reposto, com o mesmo QR.`, error: false });
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 id="lugares" className="text-lg">
          Lugares
        </h2>
        {tables.length > 0 && (
          <button type="button" onClick={() => setManaging(!managing)} className="min-h-9 rounded-full border border-line px-3 text-sm font-semibold">
            {managing ? "Concluído" : "Retirar lugares"}
          </button>
        )}
      </div>
      {managing && <p className="mt-1 text-sm text-ink-soft">Toque num lugar para o retirar (o QR deixa de abrir) ou para repor um lugar retirado.</p>}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-2 rounded-xl px-3 py-2 text-sm ${message.error ? "bg-danger-soft text-danger" : "bg-[#ecfdf3] text-ok"}`}>
          {message.text}
        </p>
      )}
      {zones.map((zone) => (
        <div key={zone} className="mt-3">
          <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{zone}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {tables
              .filter((t) => (t.zone ?? "Sem zona") === zone)
              .map((t) => (
                <li key={t.id}>
                  {managing ? (
                    <button
                      type="button"
                      disabled={busy === t.id}
                      onClick={() => void toggle(t)}
                      className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm disabled:opacity-50 ${t.active ? "border-danger/40 text-danger" : "border-dashed border-brand text-brand"}`}
                    >
                      {t.label} <span className="text-xs">{t.active ? "· Retirar" : "· Repor"}</span>
                    </button>
                  ) : (
                    <a
                      href={`/m/${t.publicToken}`}
                      target="_blank"
                      rel="noopener"
                      className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm ${t.active ? "border-line" : "border-dashed text-ink-soft line-through"}`}
                      title={t.active ? (MODE[t.orderingMode] ?? "") : "Retirado"}
                    >
                      {t.label}
                    </a>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </>
  );
}
