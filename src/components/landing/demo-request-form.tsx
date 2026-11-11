"use client";

import { useEffect, useState } from "react";
import { IconArrow, IconCheck } from "../brand/icons";

const VENUE_TYPES = ["Restaurante", "Bar de praia", "Hotel", "Piscina", "Outro"];
const SOURCES = ["Instagram", "TikTok", "Facebook", "Google", "Recomendação de alguém", "Visita ou cartão da MESVIO", "Outro"];

/** Links com ?utm_source=instagram (ou ?ref=cartao) já escolhem a resposta certa. */
const SOURCE_FROM_LINK: Record<string, string> = {
  instagram: "Instagram",
  ig: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  fb: "Facebook",
  google: "Google",
  cartao: "Visita ou cartão da MESVIO",
  qr: "Visita ou cartão da MESVIO",
};

/** Origem automática: parâmetros do link (utm_*, ref), o site de onde veio e a página de entrada. */
function readAttribution(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const q = new URLSearchParams(window.location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"]) {
      const v = q.get(k);
      if (v) out[k] = v.slice(0, 200);
    }
    const ref = document.referrer ? new URL(document.referrer).hostname : "";
    if (ref && ref !== window.location.hostname) out.referrer = ref;
    out.landing = window.location.pathname;
  } catch {
    // Sem origem: o formulário funciona na mesma.
  }
  return out;
}

const field =
  "min-h-12 w-full rounded-xl border border-white/20 bg-white/5 px-4 text-white placeholder:text-white/60 focus:border-mint focus:outline-none";

/** "Pedir demonstração": o pedido fica guardado e a equipa MESVIO recebe-o por email. */
export function DemoRequestForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<Record<string, string>>({});
  const [source, setSource] = useState("");

  useEffect(() => {
    const a = readAttribution();
    setAttribution(a);
    const guess = SOURCE_FROM_LINK[(a.utm_source ?? a.ref ?? "").toLowerCase()];
    if (guess) setSource(guess);
  }, []);

  async function submit(form: HTMLFormElement) {
    setState("sending");
    setError(null);
    const data = Object.fromEntries(new FormData(form));
    const res = await fetch("/api/contacto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => null);
    if (res?.ok) return setState("sent");
    const body = res ? await res.json().catch(() => ({})) : {};
    setError(body.message ?? "Sem ligação. Tenta de novo.");
    setState("idle");
  }

  if (state === "sent") {
    return (
      <div role="status" className="mx-auto max-w-md rounded-3xl bg-white/5 px-6 py-10 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-mint text-brand">
          <IconCheck />
        </span>
        <p className="mt-4 text-xl font-bold">Pedido recebido. Obrigado!</p>
        <p className="mt-2 text-white/80">Vamos entrar em contacto contigo em breve para marcar a demonstração.</p>
      </div>
    );
  }

  return (
    <form
      className="mx-auto grid max-w-xl gap-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e.currentTarget);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold">
          Nome
          <input name="name" required minLength={2} maxLength={120} autoComplete="name" className={field} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Nome do espaço
          <input name="business" required minLength={2} maxLength={160} autoComplete="organization" className={field} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Email
          <input name="email" type="email" required maxLength={200} autoComplete="email" className={field} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Telefone <span className="font-normal text-white/70">(opcional)</span>
          <input name="phone" type="tel" maxLength={40} autoComplete="tel" className={field} />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-semibold">
        Tipo de espaço
        <select name="venueType" defaultValue="" className={`${field} [&>option]:text-ink`}>
          <option value="">Escolher…</option>
          {VENUE_TYPES.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">
        Como conheceste a MESVIO?
        <select name="source" required value={source} onChange={(e) => setSource(e.target.value)} className={`${field} [&>option]:text-ink`}>
          <option value="" disabled>
            Escolher…
          </option>
          {SOURCES.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <input type="hidden" name="attribution" value={JSON.stringify(attribution)} />
      <label className="grid gap-1.5 text-sm font-semibold">
        Mensagem <span className="font-normal text-white/70">(opcional)</span>
        <textarea
          name="message"
          rows={3}
          maxLength={2000}
          placeholder="Quantas mesas ou espreguiçadeiras tens, que sistema POS usas…"
          className={`${field} py-3`}
        />
      </label>
      {/* Armadilha para robôs: escondida das pessoas e dos leitores de ecrã. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={state === "sending"}
        className="mt-2 inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-mint px-8 font-semibold text-brand transition hover:bg-white disabled:opacity-60"
      >
        {state === "sending" ? "A enviar…" : "Pedir demonstração"} <IconArrow className="size-5" />
      </button>
      <p className="text-center text-xs text-white/70">
        Usamos estes dados só para te contactar sobre a demonstração.{" "}
        <a href="/privacidade" className="underline hover:text-white">
          Política de Privacidade
        </a>
      </p>
    </form>
  );
}
