"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { brandPalette, normalizeHex } from "@/lib/brand-color";
import { PoweredBy } from "../brand/logo";

/** Sugestões que passam o contraste AA (texto branco nos botões). */
const SUGGESTIONS = ["#062d25", "#1d3557", "#7c2d12", "#9f1239", "#4c1d95", "#0f5257", "#1f2937"];

/** Reduz o logótipo no aparelho, mantendo o fundo transparente. O servidor aceita até 1 MB. */
async function prepareLogo(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  for (const side of [800, 500, 300]) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (blob && blob.size <= 1024 * 1024) return blob;
  }
  throw new Error("too large");
}

/** Cor e logótipo do restaurante na ementa do cliente (dono/gerente). */
export function BrandingView({ establishmentName }: { establishmentName: string }) {
  const [loaded, setLoaded] = useState(false);
  const [color, setColor] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoBroken, setLogoBroken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/painel/marca", { cache: "no-store" }).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        setColor(data.brandColor ?? "");
        setLogoUrl(data.brandLogoUrl ?? "");
      }
      setLoaded(true);
    })();
  }, []);

  const check = color ? brandPalette(color) : null;
  const palette = check?.ok ? check.palette : null;
  const previewStyle = palette
    ? ({ "--color-brand": palette.brand, "--color-brand-soft": palette.brandSoft } as CSSProperties)
    : undefined;
  const logoValid = !logoUrl || /^https:\/\/\S+$/.test(logoUrl);

  async function save(next: { brandColor: string | null; brandLogoUrl: string | null }) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/painel/marca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMessage({ text: data.message ?? "Sem ligação. Tente de novo.", error: true });
    setColor(data.brandColor ?? "");
    setLogoUrl(data.brandLogoUrl ?? "");
    setMessage({ text: "Guardado. Os clientes veem a nova aparência ao abrir a ementa.", error: false });
  }

  async function uploadLogo(file: File) {
    setBusy(true);
    setMessage(null);
    setLogoBroken(false);
    const form = new FormData();
    try {
      form.append("file", await prepareLogo(file));
    } catch {
      setBusy(false);
      return setMessage({ text: "Não foi possível ler esta imagem. Use um ficheiro PNG, JPG ou WebP.", error: true });
    }
    const res = await fetch("/api/painel/marca/logotipo", { method: "POST", body: form }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMessage({ text: data.message ?? "Sem ligação. Tente de novo.", error: true });
    setLogoUrl(data.brandLogoUrl);
    setMessage({ text: "Logótipo guardado. Os clientes veem-no ao abrir a ementa.", error: false });
  }

  async function removeLogo() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/painel/marca/logotipo", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setMessage({ text: "Sem ligação. Tente de novo.", error: true });
    setLogoUrl("");
    setLogoBroken(false);
    setMessage({ text: "Logótipo removido. A ementa mostra só o nome.", error: false });
  }

  if (!loaded) return <p className="text-ink-soft">A carregar…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <form
        className="grid content-start gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ brandColor: color ? normalizeHex(color) : null, brandLogoUrl: logoUrl.trim() || null });
        }}
      >
        <div>
          <h2 className="text-xl">Aparência da ementa</h2>
          <p className="mt-1 text-sm text-ink-soft">
            A cor e o logótipo do seu espaço na ementa, no estado do pedido e na conta. A MESVIO fica só no rodapé.
          </p>
        </div>

        <fieldset className="grid gap-3 rounded-2xl border border-line bg-card p-4">
          <legend className="px-1 font-semibold">Cor principal</legend>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              aria-label="Escolher cor"
              value={normalizeHex(color) ?? "#062d25"}
              onChange={(e) => setColor(e.target.value)}
              className="size-11 cursor-pointer rounded-xl border border-line bg-card p-1"
            />
            <input
              type="text"
              inputMode="text"
              aria-label="Código da cor"
              placeholder="#062D25 (cores MESVIO)"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="min-h-11 w-44 rounded-xl border border-line bg-card px-3 font-mono uppercase"
            />
            {color && (
              <button type="button" onClick={() => setColor("")} className="min-h-11 rounded-xl px-3 text-sm text-ink-soft underline">
                Usar cores MESVIO
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Sugestões">
            {SUGGESTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Usar ${c}`}
                className={`size-9 rounded-full ring-offset-2 ${normalizeHex(color) === c ? "ring-2 ring-ink" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
          {check && !check.ok && (
            <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              {check.reason}
            </p>
          )}
          <p className="text-xs text-ink-soft">Só aceitamos cores em que o texto fica legível para todos (contraste WCAG AA).</p>
        </fieldset>

        <fieldset className="grid gap-3 rounded-2xl border border-line bg-card p-4">
          <legend className="px-1 font-semibold">Logótipo</legend>
          <div className="flex flex-wrap items-center gap-2">
            <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-brand px-4 font-semibold text-brand ${busy ? "pointer-events-none opacity-50" : ""}`}>
              {logoUrl ? "Trocar logótipo" : "Enviar logótipo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadLogo(file);
                }}
              />
            </label>
            {logoUrl && (
              <button type="button" disabled={busy} onClick={() => void removeLogo()} className="min-h-11 rounded-xl px-3 text-sm text-ink-soft underline">
                Remover
              </button>
            )}
          </div>
          <p className="text-xs text-ink-soft">PNG, JPG ou WebP. De preferência com fundo transparente. Fica guardado logo, e reduzimos o tamanho por si.</p>
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-soft">Prefiro colar o endereço de uma imagem</summary>
            <input
              type="url"
              aria-label="Endereço do logótipo"
              placeholder="https://o-seu-site.pt/logotipo.png"
              value={logoUrl}
              onChange={(e) => {
                setLogoUrl(e.target.value);
                setLogoBroken(false);
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3"
            />
            <p className="mt-1 text-xs text-ink-soft">Depois de colar, carregue em Guardar aparência.</p>
          </details>
          {!logoValid && (
            <p role="alert" className="text-sm text-danger">
              Use um endereço que comece por https://.
            </p>
          )}
          {logoValid && logoUrl && logoBroken && (
            <p role="alert" className="text-sm text-danger">
              Não foi possível abrir esta imagem. Envie o ficheiro ou confirme o endereço.
            </p>
          )}
        </fieldset>

        {message && (
          <p
            role={message.error ? "alert" : "status"}
            className={`rounded-xl px-4 py-3 text-sm ${message.error ? "bg-danger-soft text-danger" : "bg-[#ecfdf3] text-ok"}`}
          >
            {message.text}
          </p>
        )}
        <div>
          <button
            type="submit"
            disabled={busy || (check !== null && !check.ok) || !logoValid}
            className="min-h-12 rounded-xl bg-brand px-6 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "A guardar…" : "Guardar aparência"}
          </button>
        </div>
      </form>

      <section aria-label="Pré-visualização" className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 text-sm font-semibold text-ink-soft">Pré-visualização</p>
        <div style={previewStyle} className="overflow-hidden rounded-[2rem] border border-line bg-paper p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-brand">Mesa 1 · Esplanada</span>
            <span className="rounded-full border border-line bg-card px-3 py-1 text-xs font-medium">Conta da mesa</span>
          </div>
          {logoUrl && logoValid && !logoBroken && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setLogoBroken(true)}
              className="mt-4 h-14 w-auto max-w-[12rem] object-contain object-left"
            />
          )}
          <p className="mt-1 text-2xl font-extrabold tracking-tight">{establishmentName}</p>
          <div className="mt-4 flex gap-1.5 text-xs font-semibold">
            <span className="rounded-full bg-brand px-3 py-1.5 text-white">Comida</span>
            <span className="rounded-full bg-card px-3 py-1.5 text-ink-soft">Bebidas</span>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white">
            <span>Ver pedido · 2</span>
            <span>23,50 €</span>
          </div>
          <div className="mt-4 flex justify-center">
            <PoweredBy />
          </div>
        </div>
      </section>
    </div>
  );
}
