"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const field = "mt-1 block w-full rounded-xl border border-line bg-card px-4 py-3 text-base";
const primary = "min-h-12 rounded-2xl bg-brand px-5 font-semibold text-white disabled:opacity-50";

async function post(url: string, body: unknown): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, message: data.message };
  } catch {
    return { ok: false, message: "Sem ligação. Verifique a rede." };
  }
}

/** Entrada com código de 6 dígitos enviado por email (Supabase Auth). Funciona num tablet partilhado. */
export function EmailCodeLogin() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await post("/api/painel/auth/codigo", { email });
    setBusy(false);
    if (!r.ok) return setError(r.message ?? "Não foi possível enviar o código.");
    setInfo(r.message ?? null);
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await post("/api/painel/auth/verificar", { email, codigo });
    setBusy(false);
    if (!r.ok) return setError(r.message ?? "Código inválido.");
    router.replace("/painel");
    router.refresh();
  }

  return step === "email" ? (
    <form onSubmit={sendCode} className="mt-8 grid gap-4">
      <label className="text-sm font-semibold">
        Email
        <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </label>
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className={primary}>{busy ? "A enviar…" : "Enviar código"}</button>
      <p className="text-xs text-ink-soft">Só entram pessoas convidadas pelo dono ou gerente do restaurante.</p>
    </form>
  ) : (
    <form onSubmit={verify} className="mt-8 grid gap-4">
      {info && <p className="rounded-xl bg-[#ecfdf3] px-4 py-3 text-sm text-ok">{info}</p>}
      <label className="text-sm font-semibold">
        Código de 6 dígitos
        <input
          className={`${field} text-center text-2xl tracking-[0.4em] tabular-nums`}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          required
        />
      </label>
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy || codigo.length !== 6} className={primary}>{busy ? "A verificar…" : "Entrar"}</button>
      <button type="button" onClick={() => { setStep("email"); setCodigo(""); setError(null); }} className="text-sm text-ink-soft underline">
        Usar outro email
      </button>
    </form>
  );
}

const ROLE = { owner: "Dono", manager: "Gerente", staff: "Staff" } as const;

/** Modo de desenvolvimento (sem Supabase): escolher um utilizador de demonstração. */
export function DevLogin({
  users,
}: {
  users: { userId: string; email: string; displayName: string | null; role: keyof typeof ROLE; establishmentName: string | null }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function enter(userId: string) {
    setBusy(userId);
    const r = await post("/api/painel/auth/dev", { userId });
    setBusy(null);
    if (!r.ok) return setError(r.message ?? "Não foi possível entrar.");
    router.replace("/painel");
    router.refresh();
  }

  return (
    <div className="mt-8">
      <p className="rounded-xl border border-dashed border-brand px-4 py-3 text-sm">
        <strong>Modo de desenvolvimento.</strong> A Supabase Auth não está configurada, por isso entra-se escolhendo um utilizador de
        demonstração. Em produção este ecrã não existe.
      </p>
      <ul className="mt-4 grid gap-2">
        {users.map((u) => (
          <li key={u.userId}>
            <button
              type="button"
              onClick={() => enter(u.userId)}
              disabled={busy !== null}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 text-left disabled:opacity-50"
            >
              <span>
                <span className="block font-semibold">{u.displayName ?? u.email}</span>
                <span className="block text-xs text-ink-soft">{u.email}</span>
              </span>
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">{ROLE[u.role]}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
