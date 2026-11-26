"use client";

import { useEffect, useState } from "react";
import { EXTRA_KEYS, EXTRAS, type ExtraKey } from "@/lib/extras";
import { PLAN_LABEL, PLAN_MONTHLY_CENTS, PLANS, type Plan } from "@/lib/plan";
import { extraCents, proposalEmail } from "@/lib/proposal-email";

const PHONE_KEY = "mesvio-central-telefone";
const eur = (c: number) => `${(c / 100).toLocaleString("pt-PT", { minimumFractionDigits: c % 100 ? 2 : 0 })} €`;

/**
 * "Proposta": escolhe-se o plano, se tem espreguiçadeiras e os extras, e sai o email completo
 * (imagens, taxas da Stripe, instalação, preço) para colar no Gmail.
 */
export function ProposalDialog({
  restaurant,
  url,
  email,
  sender,
  baseUrl,
  onClose,
}: {
  restaurant: string;
  url: string;
  email: string | null;
  sender: string;
  baseUrl: string;
  onClose: () => void;
}) {
  const [contactName, setContactName] = useState("");
  const [plan, setPlan] = useState<Plan>("payments");
  const [sunbeds, setSunbeds] = useState(false);
  const [extras, setExtras] = useState<ExtraKey[]>([]);
  const [extrasOptional, setExtrasOptional] = useState(true);
  const [phone, setPhone] = useState("920 636 605");
  const [to, setTo] = useState(email ?? "");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PHONE_KEY);
      if (saved !== null) setPhone(saved);
    } catch {
      // Sem armazenamento: fica o número por omissão.
    }
  }, []);

  const monthly = PLAN_MONTHLY_CENTS[plan] + (extrasOptional ? 0 : extras.reduce((t, k) => t + extraCents(k), 0));
  const build = () =>
    proposalEmail({
      restaurant,
      contactName: contactName.trim() || undefined,
      url,
      sender,
      phone,
      baseUrl,
      plan,
      sunbeds,
      extras: extrasOptional ? [] : extras,
      optionalExtras: extrasOptional ? extras : [],
    });

  async function copy(): Promise<boolean> {
    try {
      localStorage.setItem(PHONE_KEY, phone);
    } catch {
      // Sem armazenamento: não faz mal.
    }
    const { html, text } = build();
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      return true;
    } catch {
      await navigator.clipboard.writeText(text).catch(() => undefined);
      return false;
    }
  }

  async function gmail() {
    const rich = await copy();
    const { subject } = build();
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to.trim())}&su=${encodeURIComponent(subject)}`, "_blank", "noopener");
    setNotice(rich ? "Proposta copiada com as imagens. No Gmail, clique no texto da mensagem e cole com Cmd+V." : "Este navegador só copiou o texto simples. Use o Chrome para copiar com as imagens.");
  }

  async function copyOnly() {
    const rich = await copy();
    setNotice(rich ? `Proposta copiada com as imagens. Assunto: ${build().subject}` : "Copiado só o texto simples (use o Chrome para as imagens).");
  }

  const field = "mt-1 block min-h-11 w-full rounded-xl border border-line bg-paper px-3";
  return (
    <div role="dialog" aria-label={`Proposta para ${restaurant}`} className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/60 p-4" onClick={onClose}>
      <div className="grid w-full max-w-lg gap-3 rounded-3xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold">📄 Proposta para {restaurant}</h3>
            <p className="text-sm text-ink-soft">Escolha o que combinaram; o email sai completo, com as imagens e o link da ementa.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="-mt-1 -mr-1 p-2 text-2xl leading-none text-ink-soft">
            ×
          </button>
        </div>

        <fieldset className="grid gap-1">
          <legend className="text-sm font-semibold">Plano</legend>
          {PLANS.map((p) => (
            <label key={p} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm ${plan === p ? "border-brand bg-brand-soft/50 font-semibold" : "border-line"}`}>
              <input type="radio" name="plano" checked={plan === p} onChange={() => setPlan(p)} />
              <span className="flex-1">{PLAN_LABEL[p]}</span>
              <span className="tabular-nums">{eur(PLAN_MONTHLY_CENTS[p])}/mês</span>
            </label>
          ))}
        </fieldset>

        <label className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm ${sunbeds ? "border-brand font-semibold" : "border-line"}`}>
          <input type="checkbox" checked={sunbeds} onChange={(e) => setSunbeds(e.target.checked)} />
          Tem espreguiçadeiras {plan !== "payments" && sunbeds && <span className="font-normal text-ink-soft">(pagar ao pedir só no plano com pagamentos)</span>}
        </label>

        <fieldset className="grid gap-1">
          <legend className="text-sm font-semibold">Extras (opcional)</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {EXTRA_KEYS.map((k) => (
              <label key={k} className="flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm">
                <input type="checkbox" checked={extras.includes(k)} onChange={(e) => setExtras((x) => (e.target.checked ? [...x, k] : x.filter((y) => y !== k)))} />
                <span className="flex-1">{EXTRAS[k].label}</span>
                <span className="text-xs text-ink-soft">{EXTRAS[k].price.replace("/mês", "")}</span>
              </label>
            ))}
          </div>
          {extras.length > 0 && (
            <div className="mt-1 grid grid-cols-2 gap-1 text-sm" role="radiogroup" aria-label="Como apresentar os extras">
              <label className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 ${extrasOptional ? "border-brand font-semibold" : "border-line"}`}>
                <input type="radio" checked={extrasOptional} onChange={() => setExtrasOptional(true)} /> Opcionais (&ldquo;se quiserem&rdquo;)
              </label>
              <label className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 ${!extrasOptional ? "border-brand font-semibold" : "border-line"}`}>
                <input type="radio" checked={!extrasOptional} onChange={() => setExtrasOptional(false)} /> Incluídos no preço
              </label>
            </div>
          )}
        </fieldset>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Nome do contacto <span className="font-normal text-ink-soft">(opcional)</span>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={60} placeholder="ex.: Giovana" className={field} />
          </label>
          <label className="text-sm font-semibold">
            O seu telefone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className={field} />
          </label>
        </div>
        <label className="text-sm font-semibold">
          Enviar para
          <input value={to} onChange={(e) => setTo(e.target.value)} type="email" placeholder="email do restaurante" className={field} />
        </label>

        <p className="rounded-xl bg-paper px-3 py-2 text-sm">
          Total na proposta: <strong className="tabular-nums">{eur(monthly)} por mês</strong>, sem comissão e sem fidelização.
        </p>
        {notice && (
          <p role="status" className="rounded-xl bg-[#ecfdf3] px-3 py-2 text-sm text-ok">
            {notice}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void gmail()} className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-white">
            Enviar pelo Gmail
          </button>
          <button type="button" onClick={() => void copyOnly()} className="min-h-11 rounded-xl border border-line bg-paper px-4 font-semibold">
            Só copiar
          </button>
        </div>
      </div>
    </div>
  );
}
