"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseProspects, type ProspectRow } from "@/lib/prospect-csv";

type Status = { state: "waiting" | "working" | "done" | "error"; text?: string };
const PARALLEL = 3;

/** Criar links em lote: cola-se a lista de restaurantes (nome, link da ementa, email) e a Central cria um link para cada um. */
export function BatchPreviews() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<(ProspectRow & { use: boolean })[] | null>(null);
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [running, setRunning] = useState(false);

  function read() {
    const parsed = parseProspects(text);
    setRows(parsed.map((r) => ({ ...r, use: true })));
    setStatus({});
  }

  async function run() {
    if (!rows) return;
    setRunning(true);
    const queue = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => r.use && status[i]?.state !== "done");
    const work = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const { r, i } = job;
        setStatus((s) => ({ ...s, [i]: { state: "working" } }));
        const res = await fetch("/api/central/previsualizacoes/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restaurantName: r.name, url: r.url, contactEmail: r.email }),
        }).catch(() => null);
        const d = res ? await res.json().catch(() => ({})) : {};
        setStatus((s) => ({
          ...s,
          [i]: res?.ok ? { state: "done", text: `${d.products} pratos` } : { state: "error", text: d.message ?? "Sem ligação." },
        }));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, work));
    setRunning(false);
    router.refresh();
  }

  const chosen = rows?.filter((r) => r.use).length ?? 0;
  const done = Object.values(status).filter((s) => s.state === "done").length;
  const pending = rows?.filter((r, i) => r.use && status[i]?.state !== "done").length ?? 0;
  const icon = (s?: Status) => (!s ? "" : s.state === "working" ? "⏳" : s.state === "done" ? "✓" : s.state === "error" ? "✗" : "");

  return (
    <section aria-labelledby="lote" className="mt-10 rounded-3xl border border-line bg-card p-5">
      <h2 id="lote" className="text-xl">
        Criar links em lote
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Cole a lista de restaurantes (copiada da folha de cálculo ou do ficheiro CSV, com as colunas nome, link da ementa e email). A
        Central lê a ementa de cada um, traduz e cria o link. Demora cerca de um minuto por restaurante: deixe esta página aberta.
      </p>
      {!rows ? (
        <div className="mt-3 grid gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"nome;link_ementa;email\nCafé do Mar;https://cafedomar.pt/ementa-pt/;info@cafedomar.pt"}
            aria-label="Lista de restaurantes"
            className="rounded-xl border border-line bg-paper px-3 py-2 font-mono text-xs"
          />
          <button type="button" onClick={read} disabled={!text.trim()} className="min-h-11 w-fit rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-50">
            Ler a lista
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-3">
          <p className="text-sm text-danger">Não encontrámos restaurantes com nome e link da ementa nesta lista.</p>
          <button type="button" onClick={() => setRows(null)} className="mt-2 text-sm underline">
            Voltar
          </button>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <ul className="grid max-h-[28rem] gap-1 overflow-y-auto">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={r.use}
                  disabled={running}
                  onChange={(e) => setRows((rs) => rs!.map((x, k) => (k === i ? { ...x, use: e.target.checked } : x)))}
                  aria-label={`Incluir ${r.name}`}
                  className="size-4 accent-[var(--color-brand)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{r.name}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {r.url} {r.email ? `· ${r.email}` : "· sem email"}
                  </span>
                </span>
                <span className={`shrink-0 text-xs ${status[i]?.state === "error" ? "text-danger" : status[i]?.state === "done" ? "text-ok" : "text-ink-soft"}`}>
                  {icon(status[i])} {status[i]?.text ?? (status[i]?.state === "working" ? "a ler…" : "")}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={run} disabled={running || pending === 0} className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-50">
              {running ? `A criar… (${done} de ${chosen})` : pending === 0 && done > 0 ? "Concluído ✓" : done > 0 ? `Tentar os ${pending} que faltam` : `Criar ${chosen} links`}
            </button>
            <button type="button" onClick={() => setRows(null)} disabled={running} className="min-h-11 rounded-xl px-4 text-sm text-ink-soft underline">
              Outra lista
            </button>
            <span className="text-xs text-ink-soft">Os links aparecem em &quot;Links enviados&quot;, mais abaixo. Cada leitura custa alguns cêntimos.</span>
          </div>
        </div>
      )}
    </section>
  );
}
