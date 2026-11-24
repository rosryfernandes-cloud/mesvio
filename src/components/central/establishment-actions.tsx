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
  const [mode, setMode] = useState<"pay_later" | "pay_first" | "menu_only">("pay_later");
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
            onChange={(e) => setMode(e.target.value as "pay_later" | "pay_first" | "menu_only")}
            className={field}
          >
            <option value="pay_later">Mesas (pagam no fim)</option>
            <option value="pay_first">Espreguiçadeiras (pagam ao pedir)</option>
            <option value="menu_only">Só ementa (sem pedidos pela app)</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Nome
          <input key={mode} name="prefix" defaultValue={mode === "pay_first" ? "Cama" : "Mesa"} maxLength={30} required className={field} />
        </label>
        <label className="text-sm font-semibold">
          Zona
          <input key={`z-${mode}`} name="zone" defaultValue={mode === "pay_first" ? "Praia" : mode === "menu_only" ? "Sala" : "Esplanada"} maxLength={40} className={field} />
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

/** Abre o painel deste restaurante em modo suporte (recarrega a página para o painel ler o novo cookie). */
export function OpenPanelButton({ establishmentId }: { establishmentId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/central/restaurantes/${establishmentId}/suporte`, { method: "POST" }).catch(() => null);
    if (res?.ok) return window.location.assign("/painel");
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    setError(data.message ?? "Não foi possível abrir o painel. Tente de novo.");
  }
  return (
    <>
      <button type="button" onClick={open} disabled={busy} className="min-h-11 rounded-xl border border-brand px-5 py-2.5 font-semibold text-brand disabled:opacity-60">
        {busy ? "A abrir..." : "Abrir painel"}
      </button>
      {error && (
        <p role="alert" className="w-full rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}

/** Corrigir o nome legal, o NIF, o email de faturação e o nome na ementa (ex.: depois de uma demonstração). */
export function CompanyForm({
  establishmentId,
  legalName,
  nif,
  billingEmail,
  name,
}: {
  establishmentId: string;
  legalName: string;
  nif: string;
  billingEmail: string | null;
  name: string;
}) {
  const { busy, message, submit } = useSubmit(`/api/central/restaurantes/${establishmentId}/empresa`);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-brand underline">
        Editar dados da empresa
      </button>
    );
  return (
    <form
      className="grid gap-3 rounded-2xl border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void submit(
          { name: String(f.get("name")), legalName: String(f.get("legalName")), nif: String(f.get("nif")).replace(/\s/g, ""), billingEmail: String(f.get("billingEmail")) },
          () => "Dados guardados.",
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Nome na ementa
          <input name="name" defaultValue={name} required maxLength={120} className={field} />
        </label>
        <label className="text-sm font-semibold">
          Nome legal
          <input name="legalName" defaultValue={legalName} required maxLength={160} className={field} />
        </label>
        <label className="text-sm font-semibold">
          NIF
          <input name="nif" defaultValue={nif} required inputMode="numeric" maxLength={11} className={field} />
        </label>
        <label className="text-sm font-semibold">
          Email de faturação <span className="font-normal text-ink-soft">(opcional)</span>
          <input name="billingEmail" type="email" defaultValue={billingEmail ?? ""} maxLength={200} className={field} />
        </label>
      </div>
      <Message m={message} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-50">
          {busy ? "A guardar…" : "Guardar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl px-4 text-sm text-ink-soft underline">
          Fechar
        </button>
      </div>
    </form>
  );
}

/** Tirar um dono (com confirmação). A Central recusa se o restaurante ficasse sem dono. */
export function RemoveOwnerButton({ establishmentId, userId, label }: { establishmentId: string; userId: string; label: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/central/restaurantes/${establishmentId}/dono?utilizador=${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(data.message ?? "Não foi possível tirar.");
    setConfirm(false);
    router.refresh();
  }
  if (!confirm)
    return (
      <button type="button" onClick={() => setConfirm(true)} className="ml-2 text-xs text-danger underline">
        Tirar
      </button>
    );
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-2 text-xs">
      <span>Tirar {label}?</span>
      <button type="button" onClick={remove} disabled={busy} className="rounded-lg bg-danger px-2 py-1 font-semibold text-white disabled:opacity-60">
        Sim, tirar
      </button>
      <button type="button" onClick={() => setConfirm(false)} className="underline">
        Voltar
      </button>
      {error && <span role="alert" className="text-danger">{error}</span>}
    </span>
  );
}
