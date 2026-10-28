"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEur } from "@/lib/money";

type Invoice = { id: string; status: "pending" | "issued" | "failed" | "manual"; ref: string | null; error: string | null; email: string | null; nif: string | null; amountCents: number; tipCents: number; at: string };
type Data = { configured: boolean; account: string | null; invoices: Invoice[] };

const STATUS: Record<Invoice["status"], { text: string; className: string }> = {
  pending: { text: "A emitir", className: "bg-brand-soft text-brand" },
  issued: { text: "Enviada", className: "bg-[#ecfdf3] text-ok" },
  manual: { text: "Emitir à mão", className: "bg-amber-100 text-amber-900" },
  failed: { text: "Erro", className: "bg-danger-soft text-danger" },
};

const field = "mt-1 block w-full rounded-xl border border-line bg-paper px-3 py-2.5";

/** Fatura por email aos clientes: ligar o InvoiceXpress do restaurante e ver as últimas faturas. */
export function InvoicingCard() {
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState(false);
  const [account, setAccount] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/painel/faturacao", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: unknown) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/painel/faturacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    return { ok: Boolean(res?.ok), message: d.message as string | undefined };
  }

  if (!data) return null;
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <p className="font-semibold">🧾 Fatura por email aos clientes</p>
      {data.configured && !editing ? (
        <>
          <p className="mt-1 text-sm text-ink-soft">
            ✓ Ligado ao InvoiceXpress (<strong>{data.account}</strong>). Quem paga no telemóvel pode pedir fatura com NIF; a fatura-recibo sai do
            vosso programa e chega por email em 1 a 2 minutos.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="min-h-10 rounded-xl border border-line bg-paper px-3 text-sm" onClick={() => setEditing(true)}>
              Trocar chave
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-10 rounded-xl border border-line bg-paper px-3 text-sm text-danger"
              onClick={async () => {
                if (!confirm("Desligar a fatura por email? Os clientes deixam de a poder pedir na app.")) return;
                await post({ remove: true });
                await load();
              }}
            >
              Desligar
            </button>
          </div>
          {data.invoices.length > 0 && (
            <ul className="mt-4 grid gap-1 text-sm">
              {data.invoices.slice(0, 8).map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
                  <span>
                    {formatEur(i.amountCents - i.tipCents)} · {i.nif ? `NIF ${i.nif}` : "consumidor final"} · {i.email}
                    {i.error && i.status !== "issued" && <span className="block text-xs text-ink-soft">{i.error}</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[i.status].className}`}>
                    {STATUS[i.status].text}
                    {i.status === "issued" && i.ref ? ` · ${i.ref}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <form
          className="mt-2 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await post({ account, apiKey });
            if (!r.ok) return setMessage({ text: r.message ?? "Não foi possível ligar.", error: true });
            setEditing(false);
            setApiKey("");
            setMessage({ text: "InvoiceXpress ligado. Já pode receber pedidos de fatura.", error: false });
            await load();
          }}
        >
          <p className="text-sm text-ink-soft">
            A fatura tem de sair de um programa certificado pela AT. Ligue a conta InvoiceXpress do restaurante: no InvoiceXpress, em{" "}
            <strong>Definições → API</strong>, copie o nome da conta e a chave da API.
          </p>
          <label className="text-sm font-semibold">
            Nome da conta
            <input className={field} value={account} onChange={(e) => setAccount(e.target.value)} placeholder="ex.: swara (de swara.app.invoicexpress.com)" required />
          </label>
          <label className="text-sm font-semibold">
            Chave da API
            <input className={field} value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" autoComplete="off" required />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "A confirmar…" : "Ligar InvoiceXpress"}
            </button>
            {editing && (
              <button type="button" className="min-h-11 rounded-xl border border-line px-4 text-sm" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-3 rounded-xl px-4 py-3 text-sm ${message.error ? "bg-danger-soft text-danger" : "bg-[#ecfdf3] text-ok"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
