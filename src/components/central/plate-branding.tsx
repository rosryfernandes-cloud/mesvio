"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Cores rápidas para escolher com o cliente (a primeira é a cor MESVIO). */
const PRESETS = [
  { hex: "#062D25", name: "Verde MESVIO" },
  { hex: "#0E4D64", name: "Azul mar" },
  { hex: "#1E3F8A", name: "Azul azulejo" },
  { hex: "#2F6B3B", name: "Verde oliva" },
  { hex: "#B5532E", name: "Terracota" },
  { hex: "#7A1F2B", name: "Bordeaux" },
  { hex: "#C08A2E", name: "Mostarda" },
  { hex: "#1F2937", name: "Grafite" },
] as const;

/** Placas: escolher a cor e enviar o logótipo do restaurante sem sair da página (muda também na ementa). */
export function PlateBranding({ establishmentId, brandColor, hasLogo }: { establishmentId: string; brandColor: string | null; hasLogo: boolean }) {
  const router = useRouter();
  const [color, setColor] = useState(brandColor ?? "#062D25");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function saveColor(value: string | null) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/central/restaurantes/${establishmentId}/marca`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandColor: value }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMessage({ text: data.message ?? "Não foi possível guardar a cor.", error: true });
    setMessage({ text: value ? "Cor guardada." : "Voltou à cor MESVIO.", error: false });
    router.refresh();
  }

  async function uploadLogo(file: File) {
    setBusy(true);
    setMessage(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/central/restaurantes/${establishmentId}/marca/logotipo`, { method: "POST", body: form }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMessage({ text: data.message ?? "Não foi possível enviar o logótipo.", error: true });
    setMessage({ text: "Logótipo guardado.", error: false });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex w-full flex-wrap gap-2" role="group" aria-label="Cores rápidas">
        {PRESETS.map((c) => (
          <button
            key={c.hex}
            type="button"
            disabled={busy}
            title={c.name}
            aria-label={c.name}
            aria-pressed={color.toLowerCase() === c.hex.toLowerCase()}
            onClick={() => {
              setColor(c.hex);
              void saveColor(c.hex);
            }}
            className={`size-9 rounded-full border-2 disabled:opacity-50 ${color.toLowerCase() === c.hex.toLowerCase() ? "border-ink ring-2 ring-brand-soft" : "border-white shadow-[0_0_0_1px_#dfe5df]"}`}
            style={{ background: c.hex }}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        Outra cor
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-paper" aria-label="Cor do restaurante" />
      </label>
      <button type="button" disabled={busy} onClick={() => saveColor(color)} className="min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
        Guardar cor
      </button>
      <label className="flex min-h-10 cursor-pointer items-center rounded-xl border border-brand px-4 text-sm font-semibold text-brand">
        {hasLogo ? "Trocar logótipo" : "Enviar logótipo"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadLogo(f);
          }}
        />
      </label>
      <span className="text-xs text-ink-soft">Muda também na ementa digital do restaurante. Logótipo em PNG ou JPG, até 1 MB.</span>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`w-full text-sm ${message.error ? "text-danger" : "text-ok"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
