"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Place = { id: string; label: string; zone: string | null; orderingMode: string; publicToken: string; active: boolean };

const MODES = [
  { value: "pay_later", label: "Mesa (paga no fim)" },
  { value: "pay_first", label: "Espreguiçadeira (paga ao pedir)" },
  { value: "menu_only", label: "Só ementa (sem pedidos pela app)" },
] as const;
const MODE_SHORT: Record<string, string> = { pay_first: "Paga ao pedir", menu_only: "Só ementa", pay_later: "Paga no fim" };
const field = "mt-1 block min-h-11 w-full rounded-xl border border-line bg-paper px-3";

/**
 * Lugares do restaurante por zona. Em "Editar lugares", tocar num lugar abre a edição: nome, zona,
 * tipo, e retirar (o QR deixa de abrir) ou repor. O QR nunca muda: as placas impressas continuam a servir.
 */
export function PlacesList({ establishmentId, tables }: { establishmentId: string; tables: Place[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<Place | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const zones = [...new Set(tables.map((t) => t.zone ?? "Sem zona"))];

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 id="lugares" className="text-lg">
          Lugares
        </h2>
        {tables.length > 0 && (
          <button type="button" onClick={() => setEditing(!editing)} className="min-h-9 rounded-full border border-line px-3 text-sm font-semibold">
            {editing ? "Concluído" : "Editar lugares"}
          </button>
        )}
      </div>
      {editing && <p className="mt-1 text-sm text-ink-soft">Toque num lugar para mudar o nome, a zona ou o tipo, ou para o retirar. O QR não muda.</p>}
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
                  {editing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMessage(null);
                        setOpen(t);
                      }}
                      className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm ${t.active ? "border-brand text-brand" : "border-dashed text-ink-soft line-through"}`}
                    >
                      ✏️ {t.label}
                    </button>
                  ) : (
                    <a
                      href={`/m/${t.publicToken}`}
                      target="_blank"
                      rel="noopener"
                      className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm ${t.active ? "border-line" : "border-dashed text-ink-soft line-through"}`}
                      title={t.active ? (MODE_SHORT[t.orderingMode] ?? "") : "Retirado"}
                    >
                      {t.label}
                    </a>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {open && (
        <EditPlace
          establishmentId={establishmentId}
          place={open}
          onClose={() => setOpen(null)}
          onDone={(text) => {
            setOpen(null);
            setMessage({ text, error: false });
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function EditPlace({ establishmentId, place, onClose, onDone }: { establishmentId: string; place: Place; onClose: () => void; onDone: (text: string) => void }) {
  const [label, setLabel] = useState(place.label);
  const [zone, setZone] = useState(place.zone ?? "");
  const [mode, setMode] = useState(place.orderingMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown> | null, done: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/central/restaurantes/${establishmentId}/mesas/${place.id}`, {
      method: body ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(d.message ?? "Não foi possível guardar. Tente outra vez.");
    onDone(done);
  }

  return (
    <div role="dialog" aria-label={`Editar ${place.label}`} className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onClick={onClose}>
      <form
        className="grid w-full max-w-sm gap-3 rounded-3xl bg-card p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void send({ label, zone, orderingMode: mode }, `"${label.trim()}" guardado.`);
        }}
      >
        <h3 className="text-lg font-bold">Editar {place.label}</h3>
        <label className="text-sm font-semibold">
          Nome
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} required className={field} />
        </label>
        <label className="text-sm font-semibold">
          Zona <span className="font-normal text-ink-soft">(opcional)</span>
          <input value={zone} onChange={(e) => setZone(e.target.value)} maxLength={40} placeholder="Sala, Praia, Esplanada…" className={field} />
        </label>
        <label className="text-sm font-semibold">
          Tipo
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={field}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="min-h-12 rounded-xl bg-brand font-semibold text-white disabled:opacity-50">
          {busy ? "A guardar…" : "Guardar"}
        </button>
        <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
          {place.active ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Retirar "${place.label}"? O QR deste lugar deixa de abrir a ementa. Pode repô-lo depois, com o mesmo QR.`))
                  void send({ active: false }, `"${place.label}" retirado. O QR já não abre a ementa.`);
              }}
              className="min-h-10 rounded-xl px-2 text-sm font-semibold text-danger"
            >
              Retirar este lugar
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void send({ active: true }, `"${place.label}" reposto, com o mesmo QR.`)} className="min-h-10 rounded-xl px-2 text-sm font-semibold text-brand">
              Repor este lugar
            </button>
          )}
          <button type="button" onClick={onClose} className="min-h-10 rounded-xl px-3 text-sm underline">
            Fechar
          </button>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                `Eliminar "${place.label}" de vez? O lugar e o QR deixam de existir (se o QR já estiver impresso, nunca mais funciona) e o número fica livre para a próxima mesa. Só dá para lugares que nunca tiveram pedidos.`,
              )
            )
              void send(null, `"${place.label}" eliminado. O número fica livre para a próxima mesa.`);
          }}
          className="min-h-10 rounded-xl border border-danger/40 px-3 text-sm font-semibold text-danger"
        >
          Eliminar de vez
        </button>
      </form>
    </div>
  );
}
