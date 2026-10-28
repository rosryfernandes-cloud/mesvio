"use client";

import { useState } from "react";
import type { SecurityOverview } from "@/server/platform/passkeys";
import { RecoveryCodes, registerPasskey } from "./two-factor";

const btn = "min-h-10 rounded-xl border border-line bg-paper px-3 text-sm font-semibold disabled:opacity-50";
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon" });

/** Chaves de acesso (Face ID / Touch ID) e códigos de recuperação do administrador. */
export function SecuritySettings({ initial }: { initial: SecurityOverview }) {
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const res = await fetch("/api/central/seguranca", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData(await res.json());
  }

  async function call(body: unknown) {
    const res = await fetch("/api/central/seguranca", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    return { ok: Boolean(res?.ok), data: res ? await res.json().catch(() => ({})) : { message: "Sem ligação." } };
  }

  if (codes) {
    return (
      <div className="max-w-xl">
        <RecoveryCodes codes={codes} continueLabel="Feito" onContinue={() => (setCodes(null), void reload())} />
      </div>
    );
  }

  return (
    <div className="grid max-w-xl gap-6">
      {message && (
        <p role={message.error ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${message.error ? "bg-danger-soft text-danger" : "bg-[#ecfdf3] text-ok"}`}>
          {message.text}
        </p>
      )}

      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">Face ID / Touch ID</h2>
        {data.passkeys.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">Ainda não tem nenhum aparelho registado.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {data.passkeys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
                <span>
                  <span className="font-semibold">{k.name}</span>
                  <span className="block text-xs text-ink-soft">
                    Registada {fmt(k.createdAt)}
                    {k.lastUsedAt ? ` · usada ${fmt(k.lastUsedAt)}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className={`${btn} text-danger`}
                  disabled={busy}
                  onClick={async () => {
                    if (!confirm(`Apagar a chave "${k.name}"? Deixa de servir para entrar.`)) return;
                    setBusy(true);
                    const r = await call({ action: "remove_passkey", id: k.id });
                    setBusy(false);
                    setMessage({ text: r.ok ? "Chave apagada." : (r.data.message ?? "Não foi possível apagar."), error: !r.ok });
                    await reload();
                  }}
                >
                  Apagar
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className={`${btn} mt-3`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage(null);
            const r = await registerPasskey();
            setBusy(false);
            if (r.ok) setMessage({ text: "Face ID / Touch ID registado neste aparelho.", error: false });
            else if (r.message) setMessage({ text: r.message, error: true });
            await reload();
          }}
        >
          + Registar este aparelho
        </button>
      </section>

      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">Códigos de recuperação</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Restam <strong>{data.recoveryCodesLeft}</strong> de 10. Servem para entrar sem Face ID nem app (ex.: telemóvel perdido). Gerar
          novos apaga os antigos.
        </p>
        <button
          type="button"
          className={`${btn} mt-3`}
          disabled={busy}
          onClick={async () => {
            if (data.recoveryCodesLeft > 0 && !confirm("Gerar códigos novos? Os antigos deixam de servir.")) return;
            setBusy(true);
            const r = await call({ action: "new_recovery_codes" });
            setBusy(false);
            if (r.ok) setCodes(r.data.recoveryCodes);
            else setMessage({ text: r.data.message ?? "Não foi possível gerar.", error: true });
          }}
        >
          Gerar códigos novos
        </button>
      </section>

      {data.hasTotp && <p className="text-sm text-ink-soft">A app de códigos também continua ligada.</p>}
    </div>
  );
}
