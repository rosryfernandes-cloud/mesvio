"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ZoneSoftStatus } from "@/server/pos/zonesoft/zsroi-service";

const FIELDS = [
  { name: "serial", label: "Serial do cliente (licença)", placeholder: "D_…", secret: false },
  { name: "storeId", label: "ID da loja", placeholder: "59", secret: false },
  { name: "clientId", label: "Client ID (se aparecer no portal)", placeholder: "opcional", secret: false },
  { name: "appKey", label: "APP-KEY do cliente", placeholder: "", secret: true },
  { name: "appSecret", label: "APP-SECRET do cliente", placeholder: "", secret: true },
] as const;

/** Liga o restaurante à ZoneSoft (ZSROI) com as chaves do cliente criado no portal developer.zonesoft.org. */
const EVENT_LABEL: Record<string, string> = {
  SUBMITTED: "Enviado ao POS",
  ACCEPTED: "Aceite no POS",
  REJECTED: "Recusado",
  NEEDS_ATTENTION: "Precisa de atenção",
  FAILED_RETRYING: "A tentar de novo",
  SERVED: "Pronto",
};
const when = (iso: string) => new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" });

export function ZoneSoftLink({ establishmentId, provider, status }: { establishmentId: string; provider: string; status?: ZoneSoftStatus | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pinging, setPinging] = useState(false);

  async function ping() {
    setPinging(true);
    const res = await fetch(`/api/central/restaurantes/${establishmentId}/zonesoft/ping`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setPinging(false);
    setMessage(
      res?.ok
        ? { text: `POS de testes acordado (${data.status}). Faça agora o pedido de teste.${data.detail ? ` Resposta: ${data.detail}` : ""}`, error: false }
        : { text: `${data.message ?? "Não foi possível."}${data.detail ? ` Resposta: ${data.detail}` : ""}`, error: true },
    );
  }

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
      {status && (
        <div className="mt-4 rounded-2xl border border-line p-4 text-sm">
          <p>
            <strong>Ementa:</strong> {status.products} artigos ·{" "}
            {status.lastCatalogSyncAt ? `última sincronização ${when(status.lastCatalogSyncAt)}` : "ainda não sincronizada"}
          </p>
          <p className="mt-3 font-semibold">Últimos pedidos enviados à ZoneSoft</p>
          {status.events.length === 0 ? (
            <p className="mt-1 text-ink-soft">Nenhum ainda.</p>
          ) : (
            <ul className="mt-1 grid gap-1">
              {status.events.map((e, i) => (
                <li key={i} className={e.status === "REJECTED" || e.status === "NEEDS_ATTENTION" ? "text-danger" : ""}>
                  {when(e.at)} · n.º {e.shortCode} · <strong>{EVENT_LABEL[e.status] ?? e.status}</strong>
                  {e.reason && <span className="text-ink-soft"> · {e.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {provider === "zonesoft" && !open && (
        <button type="button" onClick={ping} disabled={pinging} className="mt-4 mr-2 min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
          {pinging ? "A contactar a ZoneSoft…" : "Acordar POS de testes (ping)"}
        </button>
      )}
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
