"use client";

import { useState } from "react";
import { EXTRAS, EXTRA_KEYS, type ExtraKey } from "@/lib/extras";

type Extras = { enabled: string[]; tvToken?: string; siteToken?: string };

/** Central → restaurante: ligar os extras pagos à parte. Tudo desligado até ser ligado aqui. */
export function ExtrasCard({ establishmentId, initial, baseUrl }: { establishmentId: string; initial: Extras; baseUrl: string }) {
  const [extras, setExtras] = useState<Extras>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function send(body: object) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/central/restaurantes/${establishmentId}/extras`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setMessage(data.message ?? "Não foi possível guardar.");
    setExtras(data);
  }

  const link = (kind: "tv" | "site") => {
    const token = kind === "tv" ? extras.tvToken : extras.siteToken;
    return token ? `${baseUrl}/${kind === "tv" ? "tv" : "r"}/${token}` : null;
  };

  return (
    <section aria-labelledby="extras" className="mt-6 rounded-3xl border border-line bg-card p-5">
      <h2 id="extras" className="text-lg">
        Extras
      </h2>
      <p className="mt-1 text-sm text-ink-soft">Funcionalidades pagas à parte. Ficam desligadas até as ligar aqui; o dono passa a vê-las no painel.</p>
      <ul className="mt-3 grid gap-2">
        {EXTRA_KEYS.map((k: ExtraKey) => {
          const on = extras.enabled.includes(k);
          const url = k === "tv" || k === "site" ? link(k) : null;
          return (
            <li key={k} className="rounded-2xl border border-line p-3">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={on} disabled={busy} onChange={(e) => void send({ key: k, on: e.target.checked })} className="mt-1 size-5 accent-[var(--color-brand)]" />
                <span className="flex-1">
                  <span className="font-semibold">{EXTRAS[k].label}</span> <span className="text-sm text-ink-soft">· {EXTRAS[k].price}</span>
                  <span className="block text-sm text-ink-soft">{EXTRAS[k].hint}</span>
                </span>
              </label>
              {on && url && (
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-sm">
                  <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs break-all text-brand underline">
                    {url}
                  </a>
                  <button type="button" disabled={busy} className="text-xs underline" onClick={() => window.confirm("Trocar o link? O antigo deixa de funcionar.") && void send({ regenerate: k })}>
                    Trocar link
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {message && <p role="alert" className="mt-2 text-sm text-danger">{message}</p>}
    </section>
  );
}
