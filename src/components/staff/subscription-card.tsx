"use client";

import { useEffect, useState } from "react";
import { formatEur } from "@/lib/money";

type Status = {
  planLabel: string;
  monthlyCents: number;
  status: string | null;
  active: boolean;
  periodEnd: string | null;
  available: boolean;
  canManage: boolean;
};

const RETURN_MESSAGE: Record<string, { text: string; error: boolean }> = {
  ok: { text: "Subscrição ativada. Obrigado!", error: false },
  pendente: { text: "Pagamento em confirmação pela Stripe. Volte a abrir esta página dentro de minutos.", error: false },
  cancelada: { text: "Ativação cancelada. Pode ativar quando quiser.", error: false },
  erro: { text: "Não foi possível falar com a Stripe. Tente de novo.", error: true },
  "sem-acesso": { text: "Só o dono do restaurante pode tratar da subscrição.", error: true },
  "portal-indisponivel": { text: "A gestão da subscrição ainda não está disponível. Fale com a MESVIO.", error: true },
};

const STATUS_TEXT: Record<string, string> = {
  active: "ativa",
  trialing: "em experiência",
  past_due: "pagamento em atraso",
  unpaid: "por pagar",
  canceled: "cancelada",
  incomplete: "por concluir",
  incomplete_expired: "expirada",
  paused: "em pausa",
};

/** Mensalidade MESVIO do restaurante: plano, valor, estado e ativar/gerir (dono). */
export function SubscriptionCard() {
  const [s, setS] = useState<Status | null>(null);
  const [returned, setReturned] = useState<string | null>(null);

  useEffect(() => {
    setReturned(new URLSearchParams(window.location.search).get("subscricao"));
    void (async () => {
      const res = await fetch("/api/painel/subscricao", { cache: "no-store" }).catch(() => null);
      if (res?.ok) setS(await res.json());
    })();
  }, []);

  if (!s || !s.available) return null;
  const msg = returned ? RETURN_MESSAGE[returned] : null;
  const until = s.periodEnd ? new Date(s.periodEnd).toLocaleDateString("pt-PT", { day: "numeric", month: "long" }) : null;
  const trouble = s.status !== null && !s.active;

  return (
    <div className={`rounded-2xl border p-4 ${s.active ? "border-line bg-card" : trouble ? "border-danger bg-danger-soft" : "border-amber-500 bg-amber-50"}`}>
      {msg && (
        <p role={msg.error ? "alert" : "status"} className={`mb-2 text-sm font-semibold ${msg.error ? "text-danger" : "text-ok"}`}>
          {msg.text}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="block font-semibold">
            Subscrição MESVIO · {s.planLabel} · {formatEur(s.monthlyCents)}/mês
          </span>
          <span className="block text-ink-soft">
            {s.active
              ? `✓ Ativa${until ? ` · próxima cobrança a ${until}` : ""}`
              : s.status
                ? `Estado: ${STATUS_TEXT[s.status] ?? s.status}. Atualize o cartão para não perder o serviço.`
                : "Ainda não ativada. O cartão do restaurante é debitado todos os meses; pode cancelar quando quiser."}
          </span>
        </p>
        {s.canManage &&
          (s.status && s.status !== "canceled" && s.status !== "incomplete_expired" ? (
            <a href="/painel/subscricao/gerir" className="min-h-11 rounded-xl border border-brand px-4 py-2.5 text-sm font-semibold text-brand">
              Gerir subscrição
            </a>
          ) : (
            <a href="/painel/subscricao/ativar" className="min-h-11 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">
              Ativar subscrição
            </a>
          ))}
      </div>
    </div>
  );
}
