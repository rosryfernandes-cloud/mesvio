"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FIELDS = [
  { name: "serial", label: "Serial do cliente (licença)", placeholder: "D_…", secret: false },
  { name: "storeId", label: "ID da loja", placeholder: "59", secret: false },
  { name: "clientId", label: "Client ID (se aparecer no portal)", placeholder: "opcional", secret: false },
  { name: "appKey", label: "APP-KEY do cliente", placeholder: "", secret: true },
  { name: "appSecret", label: "APP-SECRET do cliente", placeholder: "", secret: true },
] as const;

/** Liga o restaurante à ZoneSoft (ZSROI) com as chaves do cliente criado no portal developer.zonesoft.org. */
export function ZoneSoftLink({ establishmentId, provider }: { establishmentId: string; provider: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(`/api/central/restaurantes/${establishmentId}/zonesoft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMessage({ text: data.message ?? "Não foi possível guardar.", error: true });
    e.currentTarget?.reset();
    setOpen(false);
    setMessage({ text: "Ligado à ZoneSoft. Agora faça \"Sync Menus\" no ZSBMS: a ementa aparece aqui em segundos.", error: false });
    router.refresh();
  }

  return (
    <section aria-labelledby="zonesoft" className="mt-6 rounded-3xl border border-line bg-card p-5">
      <h2 id="zonesoft" className="text-lg">
        ZoneSoft (ZSROI)
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        {provider === "zonesoft"
          ? "Ligado. A ementa vem do ZS Rest (\"Sync Menus\" no ZSBMS). O envio de pedidos para o POS ainda não está ativo."
          : "Para ligar: crie o cliente no portal developer.zonesoft.org com os endereços abaixo e cole aqui as chaves do cliente."}
      </p>
      <dl className="mt-3 grid gap-1 text-xs">
        {(["login", "menu", "order-status", "pos-status"] as const).map((p) => (
          <div key={p} className="flex flex-wrap gap-2">
            <dt className="w-28 text-ink-soft">Endpoint {p}</dt>
            <dd className="font-mono">{`https://mesvio.pt/api/pos/zonesoft/${p}`}</dd>
          </div>
        ))}
      </dl>
      {open ? (
        <form onSubmit={submit} className="mt-4 grid gap-3" autoComplete="off">
          {FIELDS.map((f) => (
            <label key={f.name} className="grid gap-1 text-sm">
              {f.label}
              <input
                name={f.name}
                type={f.secret ? "password" : "text"}
                required={f.name !== "clientId"}
                placeholder={f.placeholder}
                autoComplete="off"
                spellCheck={false}
                className="min-h-10 rounded-xl border border-line px-3 font-mono text-sm"
              />
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "A guardar…" : provider === "zonesoft" ? "Atualizar chaves" : "Ligar à ZoneSoft"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-xl border border-line px-4 text-sm">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-4 min-h-10 rounded-xl border border-brand px-4 text-sm font-semibold text-brand">
          {provider === "zonesoft" ? "Atualizar chaves da ZoneSoft" : "Ligar à ZoneSoft"}
        </button>
      )}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-3 rounded-xl px-4 py-3 text-sm ${message.error ? "bg-danger-soft text-danger" : "bg-[#ecfdf3] text-ok"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
