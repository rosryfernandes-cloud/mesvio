"use client";

import { useEffect, useState } from "react";

type Status = {
  available: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: number;
  applePay?: "active" | "inactive" | "pending" | "local" | "error";
  canConnect: boolean;
};

const APPLE_PAY: Record<NonNullable<Status["applePay"]>, string | null> = {
  active: "✓ Apple Pay ativo neste site.",
  pending: "Apple Pay: a Stripe está a validar o site (alguns minutos). Volte a abrir esta página depois.",
  inactive: "Apple Pay: a Apple recusou a validação do site. Tente mais tarde ou fale com a MESVIO.",
  error: "Apple Pay: não foi possível confirmar com a Stripe. Volte a abrir esta página.",
  local: null,
};

const RETURN_MESSAGE: Record<string, { text: string; error: boolean }> = {
  ok: { text: "Conta Stripe ligada. Já pode ligar os pagamentos no telemóvel.", error: false },
  pendente: { text: "Dados enviados. A Stripe está a verificar; pode demorar alguns minutos.", error: false },
  erro: { text: "Não foi possível falar com a Stripe. Tente de novo.", error: true },
  "sem-acesso": { text: "Só o dono do restaurante pode ligar a conta Stripe.", error: true },
};

/** Estado da conta Stripe do restaurante e o botão para a ligar (dono). */
export function StripeConnectCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [returned, setReturned] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturned(params.get("stripe"));
    setReason(params.get("motivo"));
    void (async () => {
      const res = await fetch("/api/painel/stripe", { cache: "no-store" }).catch(() => null);
      if (res?.ok) setStatus(await res.json());
    })();
  }, []);

  const msg = returned ? RETURN_MESSAGE[returned] : null;
  if (!status) return null;
  if (!status.available) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-ink-soft">
        Pagamentos <strong>simulados</strong> (sem Stripe configurada neste servidor). Nenhum dinheiro é movimentado.
      </p>
    );
  }

  const ready = status.chargesEnabled;
  return (
    <div className={`rounded-2xl border p-4 ${ready ? "border-ok bg-[#ecfdf3]" : "border-amber-500 bg-amber-50"}`}>
      {msg && (
        <p role={msg.error ? "alert" : "status"} className={`mb-2 text-sm font-semibold ${msg.error ? "text-danger" : "text-ok"}`}>
          {msg.text}
          {reason && <span className="mt-1 block font-normal">Motivo da Stripe: {reason}</span>}
        </p>
      )}
      {ready ? (
        <p className="text-sm text-ok">
          <strong>✓ Conta Stripe ligada.</strong> Os pagamentos vão diretamente para a conta bancária do restaurante; a Stripe
          retém as comissões dela e a da MESVIO.
          {status.applePay && APPLE_PAY[status.applePay] && <span className="mt-1 block">{APPLE_PAY[status.applePay]}</span>}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-amber-900">
            {!status.accountId
              ? "Para receber pagamentos no telemóvel (Apple Pay, MB WAY, cartão), ligue a conta Stripe do restaurante."
              : status.requirementsDue > 0
                ? `A Stripe ainda precisa de ${status.requirementsDue} ${status.requirementsDue === 1 ? "dado" : "dados"} para ativar os pagamentos.`
                : "A Stripe está a verificar os dados do restaurante."}
            {!status.canConnect && " Só o dono pode fazer este passo."}
          </p>
          {status.canConnect && (
            <a href="/painel/stripe/ligar" className="min-h-11 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">
              {status.accountId ? "Continuar na Stripe" : "Ligar conta Stripe"}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
