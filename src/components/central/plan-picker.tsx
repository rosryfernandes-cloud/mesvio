"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLAN_DESCRIPTION, PLAN_LABEL, PLANS, type Plan } from "@/lib/plan";

/** Plano do restaurante: o que a app deixa fazer (ementa; + pedidos; + pagamentos). */
export function PlanPicker({ establishmentId, plan }: { establishmentId: string; plan: Plan }) {
  const router = useRouter();
  const [current, setCurrent] = useState(plan);
  const [busy, setBusy] = useState<Plan | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function choose(p: Plan) {
    if (p === current || busy) return;
    setBusy(p);
    setMessage(null);
    const res = await fetch(`/api/central/restaurantes/${establishmentId}/plano`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: p }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (!res?.ok) return setMessage({ text: data.message ?? "Não foi possível mudar o plano.", error: true });
    setCurrent(p);
    setMessage({ text: `Plano mudado para "${PLAN_LABEL[p]}". Já se aplica na ementa e no painel.`, error: false });
    router.refresh();
  }

  return (
    <section aria-labelledby="plano" className="mt-6 rounded-3xl border border-line bg-card p-5">
      <h2 id="plano" className="text-lg">
        Plano
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby="plano">
        {PLANS.map((p, i) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={current === p}
            disabled={busy !== null}
            onClick={() => choose(p)}
            className={`rounded-2xl border-2 p-4 text-left disabled:opacity-60 ${current === p ? "border-brand bg-brand-soft" : "border-line bg-paper hover:border-brand"}`}
          >
            <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Plano {i + 1}</span>
            <span className="mt-1 block font-semibold">
              {current === p && "✓ "}
              {PLAN_LABEL[p]}
            </span>
            <span className="mt-1 block text-sm text-ink-soft">{busy === p ? "A mudar…" : PLAN_DESCRIPTION[p]}</span>
          </button>
        ))}
      </div>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-3 rounded-xl px-4 py-3 text-sm ${message.error ? "bg-danger-soft text-danger" : "bg-[#ecfdf3] text-ok"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
