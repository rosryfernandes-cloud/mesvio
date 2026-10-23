"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const field = "mt-1 block w-full min-h-11 rounded-xl border border-line bg-card px-3";

function useSubmit(url: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  async function submit(body: unknown, success: (data: Record<string, unknown>) => string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMessage({ text: data.message ?? "Sem ligação. Tente de novo.", error: true });
    setMessage({ text: success(data), error: false });
    router.refresh();
  }
  return { busy, message, submit };
}

function Message({ m }: { m: { text: string; error: boolean } | null }) {
  if (!m) return null;
  return (
    <p role={m.error ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${m.error ? "bg-danger-soft text-danger" : "bg-[#ecfdf3] text-ok"}`}>
      {m.text}
    </p>
  );
}

/** Acrescentar mesas ou espreguiçadeiras (numeradas a seguir às existentes). */
export function AddTablesForm({ establishmentId }: { establishmentId: string }) {
  const { busy, message, submit } = useSubmit(`/api/central/restaurantes/${establishmentId}/mesas`);
  const [mode, setMode] = useState<"pay_later" | "pay_first">("pay_later");
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void submit(
          { count: Number(f.get("count")), prefix: String(f.get("prefix")), zone: String(f.get("zone")) || undefined, orderingMode: mode },
          (d) => `${d.created} lugares criados.`,
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm font-semibold">
          Quantos
          <input name="count" type="number" min={1} max={300} defaultValue={5} required className={field} />
        </label>
        <label className="text-sm font-semibold">
          Tipo
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "pay_later" | "pay_first")}
            className={field}
          >
            <option value="pay_later">Mesas (pagam no fim)</option>
            <option value="pay_first">Espreguiçadeiras (pagam ao pedir)</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Nome
          <input key={mode} name="prefix" defaultValue={mode === "pay_first" ? "Cama" : "Mesa"} maxLength={30} required className={field} />
        </label>
        <label className="text-sm font-semibold">
          Zona
          <input key={`z-${mode}`} name="zone" defaultValue={mode === "pay_first" ? "Praia" : "Esplanada"} maxLength={40} className={field} />
        </label>
      </div>
      <Message m={message} />
      <div>
        <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-50">
          {busy ? "A criar…" : "Acrescentar lugares"}
        </button>
      </div>
    </form>
  );
}

/** Convidar (outro) dono para a organização. */
export function InviteOwnerForm({ establishmentId }: { establishmentId: string }) {
  const { busy, message, submit } = useSubmit(`/api/central/restaurantes/${establishmentId}/dono`);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void submit({ email: String(f.get("email")), displayName: String(f.get("displayName")) || undefined }, (d) =>
          d.invited ? "Convite enviado por email." : "Acesso dado (esta pessoa já tinha conta).",
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Email
          <input name="email" type="email" required maxLength={200} className={field} />
        </label>
        <label className="text-sm font-semibold">
          Nome <span className="font-normal text-ink-soft">(opcional)</span>
          <input name="displayName" maxLength={80} className={field} />
        </label>
      </div>
      <Message m={message} />
      <div>
        <button type="submit" disabled={busy} className="min-h-11 rounded-xl border border-brand px-5 font-semibold text-brand disabled:opacity-50">
          {busy ? "A convidar…" : "Convidar dono"}
        </button>
      </div>
    </form>
  );
}
