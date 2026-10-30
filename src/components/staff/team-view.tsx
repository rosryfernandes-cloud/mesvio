"use client";

import { useCallback, useEffect, useState } from "react";
import type { StaffRole } from "@/server/staff/context";
import type { TeamMember } from "@/server/staff/team-service";
import { ConfirmInline } from "./confirm-inline";

export const ROLE_LABEL: Record<StaffRole, string> = { owner: "Dono", manager: "Gerente", staff: "Staff" };
const ROLE_HELP: Record<StaffRole, string> = {
  owner: "Tudo, em todos os restaurantes da empresa, incluindo gerentes e donos.",
  manager: "Pedidos, esgotados, definições e a equipa de staff deste restaurante.",
  staff: "Pedidos e esgotados.",
};

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return res.ok ? null : ((await res.json().catch(() => ({}))).message ?? "Não foi possível concluir.");
  } catch {
    return "Sem ligação. Tente de novo.";
  }
}

export function TeamView({ manageableRoles }: { manageableRoles: StaffRole[] }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<StaffRole>(manageableRoles.includes("staff") ? "staff" : manageableRoles[0]);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/painel/equipa", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setMembers((await res.json()).members);
    else setError("Não foi possível carregar a equipa.");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await fetch("/api/painel/equipa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, displayName: displayName || undefined, role }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(res ? (data.message ?? "Não foi possível concluir.") : "Sem ligação. Tente de novo.");
    setInfo(
      data.invited === false
        ? `${email} já tinha conta MESVIO e foi adicionado à equipa (não é enviado email de convite). Basta entrar em mesvio.pt/painel com este email e pedir o código.`
        : `Convite enviado para ${email}. A pessoa entra no painel com o código que recebe por email.`,
    );
    setEmail("");
    setDisplayName("");
    await load();
  }

  async function update(m: TeamMember, newRole: StaffRole) {
    setError(await call(`/api/painel/equipa/${m.membershipId}`, "PATCH", { role: newRole }));
    await load();
  }

  async function remove(m: TeamMember) {
    setError(await call(`/api/painel/equipa/${m.membershipId}`, "DELETE"));
    setConfirmRemove(null);
    await load();
  }

  const input = "min-h-11 rounded-xl border border-line bg-card px-4";
  return (
    <div className="grid gap-8">
      {manageableRoles.length > 0 && (
        <form onSubmit={invite} className="rounded-2xl border border-line bg-card p-4">
          <h2 className="text-lg font-semibold">Convidar pessoa</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr_auto]">
            <input className={input} type="email" placeholder="email@exemplo.pt" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className={input} placeholder="Nome (opcional)" aria-label="Nome" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <select className={input} aria-label="Perfil" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {manageableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-50">
              {busy ? "…" : "Convidar"}
            </button>
          </div>
          <p className="mt-2 text-sm text-ink-soft">{ROLE_HELP[role]}</p>
          {info && <p className="mt-2 rounded-lg bg-[#ecfdf3] px-3 py-2 text-sm text-ok">{info}</p>}
        </form>
      )}

      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      <section>
        <h2 className="text-lg font-semibold">Equipa {members && <span className="text-ink-soft">({members.length})</span>}</h2>
        {!members ? (
          <p className="mt-3 text-ink-soft">A carregar…</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
            {members.map((m) => (
              <li key={m.membershipId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {m.displayName ?? m.email} {m.isYou && <span className="text-sm font-normal text-ink-soft">(você)</span>}
                  </span>
                  <span className="block text-sm text-ink-soft">
                    {m.email}
                    {m.wholeOrganization && " · todos os restaurantes"}
                  </span>
                </span>
                {m.manageable ? (
                  <>
                    <select
                      aria-label={`Perfil de ${m.email}`}
                      value={m.role}
                      onChange={(e) => update(m, e.target.value as StaffRole)}
                      className="min-h-10 rounded-lg border border-line bg-paper px-3 text-sm"
                    >
                      {manageableRoles.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setConfirmRemove(m.membershipId)} className="min-h-10 rounded-lg border border-line px-3 text-sm">
                      Remover
                    </button>
                  </>
                ) : (
                  <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">{ROLE_LABEL[m.role]}</span>
                )}
                {confirmRemove === m.membershipId && (
                  <div className="basis-full">
                    <ConfirmInline
                      message={`Remover ${m.displayName ?? m.email} da equipa? Deixa de conseguir entrar no painel deste restaurante.`}
                      confirmLabel="Sim, remover"
                      onConfirm={() => remove(m)}
                      onCancel={() => setConfirmRemove(null)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
