"use client";

import { useState } from "react";

type Status = "new" | "contacted" | "demo" | "client" | "lost";
type Row = {
  id: string;
  name: string;
  business: string;
  email: string;
  phone: string | null;
  venueType: string | null;
  message: string | null;
  /** "Como nos conheceu?" e o resumo da origem automática do link. */
  source: string | null;
  origin: string | null;
  status: Status;
  notes: string | null;
  createdAt: string;
  confirmationSent: boolean;
};

const STATUS: Record<Status, { label: string; className: string }> = {
  new: { label: "Novo", className: "bg-amber-100 text-amber-900" },
  contacted: { label: "Contactado", className: "bg-brand-soft text-brand" },
  demo: { label: "Demo marcada", className: "bg-blue-100 text-blue-900" },
  client: { label: "Cliente ✓", className: "bg-[#ecfdf3] text-ok" },
  lost: { label: "Sem interesse", className: "bg-line text-ink-soft" },
};
const ORDER: Status[] = ["new", "contacted", "demo", "client", "lost"];

const when = (iso: string) => new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" });

/** Lista dos pedidos de demonstração com o estado do seguimento e notas. */
export function DemoRequestsBoard({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<Status | "open" | "all">("open");
  const [error, setError] = useState<string | null>(null);

  async function save(id: string, patch: { status?: Status; notes?: string }) {
    setError(null);
    const before = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const res = await fetch(`/api/central/pedidos/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res?.ok) {
      setRows(before);
      setError("Não foi possível guardar. Tente de novo.");
    }
  }

  async function remove(r: Row) {
    if (!window.confirm(`Eliminar o pedido de ${r.business} (${r.name})? Não dá para desfazer.`)) return;
    setError(null);
    const before = rows;
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    const res = await fetch(`/api/central/pedidos/${r.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setRows(before);
      setError("Não foi possível eliminar. Tente de novo.");
    }
  }

  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "open" ? r.status !== "client" && r.status !== "lost" : r.status === filter));

  // De onde vêm os pedidos (e quantos viraram clientes): diz onde vale a pena pôr anúncios.
  const bySource = Object.entries(
    rows.reduce<Record<string, { total: number; clients: number }>>((acc, r) => {
      const k = r.source ?? "Não indicado";
      acc[k] ??= { total: 0, clients: 0 };
      acc[k].total++;
      if (r.status === "client") acc[k].clients++;
      return acc;
    }, {}),
  ).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="grid gap-4">
      {bySource.length > 0 && (
        <section aria-labelledby="origens" className="rounded-3xl border border-line bg-card p-5">
          <h2 id="origens" className="text-lg">
            De onde vêm os pedidos
          </h2>
          <ul className="mt-3 grid gap-2">
            {bySource.map(([k, v]) => (
              <li key={k} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate font-semibold">{k}</span>
                <span className="h-3 rounded-full bg-line" aria-hidden="true">
                  <span className="block h-3 rounded-full bg-brand" style={{ width: `${Math.round((v.total / rows.length) * 100)}%` }} />
                </span>
                <span className="whitespace-nowrap text-ink-soft">
                  {v.total} {v.total === 1 ? "pedido" : "pedidos"} · {v.clients} {v.clients === 1 ? "cliente" : "clientes"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar pedidos">
        {(
          [
            ["open", `Por tratar (${rows.filter((r) => r.status !== "client" && r.status !== "lost").length})`],
            ...ORDER.map((s) => [s, `${STATUS[s].label} (${count(s)})`] as const),
            ["all", `Todos (${rows.length})`],
          ] as [Status | "open" | "all", string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${filter === key ? "border-brand bg-brand text-white" : "border-line bg-card"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-ink-soft">Sem pedidos aqui.</p>
      ) : (
        <ul className="grid gap-3">
          {shown.map((r) => (
            <li key={r.id} className="rounded-3xl border border-line bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">
                    {r.business}
                    {r.venueType && <span className="ml-2 text-sm font-normal text-ink-soft">· {r.venueType}</span>}
                  </p>
                  <p className="text-sm">
                    {r.name} ·{" "}
                    <a href={`mailto:${r.email}`} className="text-brand underline">
                      {r.email}
                    </a>
                    {r.phone && (
                      <>
                        {" · "}
                        <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="text-brand underline">
                          {r.phone}
                        </a>
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    Pedido a {when(r.createdAt)} · {r.confirmationSent ? "recebeu o email de confirmação" : "email de confirmação por enviar"}
                  </p>
                  {(r.source || r.origin) && (
                    <p className="mt-1 text-xs">
                      {r.source && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-semibold text-brand">{r.source}</span>}
                      {r.origin && <span className="ml-2 text-ink-soft">{r.origin}</span>}
                    </p>
                  )}
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS[r.status].className}`}>{STATUS[r.status].label}</span>
              </div>
              {r.message && <p className="mt-3 rounded-2xl bg-paper px-4 py-3 text-sm whitespace-pre-line">{r.message}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {ORDER.filter((s) => s !== r.status).map((s) => (
                  <button key={s} type="button" onClick={() => save(r.id, { status: s })} className="min-h-9 rounded-xl border border-line bg-paper px-3 text-sm">
                    → {STATUS[s].label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => remove(r)}
                  className="ml-auto min-h-9 rounded-xl border border-line bg-paper px-3 text-sm text-danger"
                >
                  Eliminar
                </button>
              </div>
              <label className="mt-4 block text-sm font-semibold">
                Notas
                <textarea
                  defaultValue={r.notes ?? ""}
                  maxLength={2000}
                  rows={2}
                  placeholder="Ex.: ligar 3.ª de manhã; interessado no plano 3"
                  onBlur={(e) => e.target.value !== (r.notes ?? "") && save(r.id, { notes: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-line bg-paper px-3 py-2 font-normal"
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
