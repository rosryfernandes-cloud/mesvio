"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReviewsOverview } from "@/server/reviews/reviews";

const field = "mt-1 block w-full rounded-xl border border-line bg-paper px-3 py-2.5";

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

/** Avaliações dos clientes no fim da conta (em teste): ligar, link do Google e o que os clientes disseram. */
export function ReviewsView() {
  const [data, setData] = useState<ReviewsOverview | null>(null);
  const [googleUrl, setGoogleUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/painel/avaliacoes", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const d: ReviewsOverview = await res.json();
    setData(d);
    setGoogleUrl(d.googleReviewUrl ?? "");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(enabled: boolean) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/painel/avaliacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, googleReviewUrl: googleUrl.trim() }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMessage({ text: d.message ?? "Não foi possível guardar.", error: true });
    setMessage({ text: "Guardado.", error: false });
    await load();
  }

  if (!data) return null;
  const max = Math.max(1, ...data.distribution);

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-line bg-card p-4">
        <p className="font-semibold">⭐ Avaliações no fim da conta <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">em teste</span></p>
        <p className="mt-1 text-sm text-ink-soft">
          Depois de pagar no telemóvel, o cliente dá 1 a 5 estrelas e pode deixar um comentário, que só o restaurante vê. Todos veem também o botão
          para avaliar no Google, seja qual for a nota.
        </p>
        <label className="mt-3 flex items-center gap-3">
          <input type="checkbox" className="size-5" checked={data.enabled} disabled={busy} onChange={(e) => save(e.target.checked)} />
          <span className="font-semibold">Pedir avaliação depois de pagar</span>
        </label>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save(data.enabled);
          }}
        >
          <label className="block text-sm">
            Link de avaliação do Google (opcional)
            <input value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} placeholder="https://g.page/r/…/review" className={field} inputMode="url" />
          </label>
          <p className="mt-1 text-xs text-ink-soft">
            No Perfil da Empresa no Google: <strong>Pedir avaliações</strong> → copiar o link.
          </p>
          <button type="submit" disabled={busy} className="mt-2 min-h-10 rounded-xl border border-line bg-paper px-3 text-sm font-semibold">
            Guardar link
          </button>
        </form>
        {message && (
          <p role={message.error ? "alert" : "status"} className={`mt-3 text-sm ${message.error ? "text-danger" : "text-ok"}`}>
            {message.text}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-4">
        <p className="font-semibold">Últimos 90 dias</p>
        {data.count === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">Ainda não há avaliações.</p>
        ) : (
          <>
            <p className="mt-2 text-3xl font-extrabold tabular-nums">
              {data.average?.toLocaleString("pt-PT", { minimumFractionDigits: 1 })} <span className="text-amber-500">★</span>
              <span className="ml-2 text-base font-normal text-ink-soft">{data.count} {data.count === 1 ? "avaliação" : "avaliações"}</span>
            </p>
            <ul className="mt-3 grid gap-1 text-sm">
              {[5, 4, 3, 2, 1].map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <span className="w-6 tabular-nums">{n}★</span>
                  <span className="h-2 flex-1 rounded-full bg-paper">
                    <span className="block h-2 rounded-full bg-amber-500" style={{ width: `${(data.distribution[n - 1] / max) * 100}%` }} />
                  </span>
                  <span className="w-8 text-right tabular-nums text-ink-soft">{data.distribution[n - 1]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {data.recent.length > 0 && (
        <ul className="grid gap-2">
          {data.recent.map((r) => (
            <li key={r.id} className={`rounded-2xl border p-4 ${r.stars <= 2 ? "border-danger bg-danger-soft" : "border-line bg-card"}`}>
              <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-lg text-amber-500" aria-label={`${r.stars} estrelas`}>{stars(r.stars)}</span>
                <span className="text-ink-soft">
                  {r.tableLabel} · {new Date(r.createdAt).toLocaleString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </p>
              {r.comment && <p className="mt-1 whitespace-pre-line">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
