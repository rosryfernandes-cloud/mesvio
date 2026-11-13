"use client";

import { useEffect, useState } from "react";
import { formatEur } from "@/lib/money";

type Lang = "pt" | "en" | "es" | "fr" | "de";
const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: "pt", label: "Português", flag: "🇵🇹" },
  { id: "en", label: "English", flag: "🇬🇧" },
  { id: "es", label: "Español", flag: "🇪🇸" },
  { id: "fr", label: "Français", flag: "🇫🇷" },
  { id: "de", label: "Deutsch", flag: "🇩🇪" },
];

type Menu = { categories: { name: string; products: { name: string; description: string | null; priceCents: number | null; imageUrl: string | null }[] }[] };
type Translations = Record<string, Record<string, { name: string; description?: string }>>;

const FEATURES = [
  ["🌍", "Em 5 línguas", "Cada turista vê a ementa na língua do telemóvel."],
  ["🛒", "Pedidos pelo telemóvel", "O cliente pede e chama o empregado da mesa; os pedidos chegam logo ao painel e ao talão da cozinha."],
  ["⚠️", "Alergénios", "Os 14 alergénios em cada prato, sugeridos automaticamente e confirmados por si."],
  ["✏️", "Muda num minuto", "Preços, pratos esgotados e fotos mudam-se no telemóvel e aparecem logo."],
  ["📊", "Resumo da semana", "O que vende, as horas de mais movimento e o que esgota."],
  ["⭐", "Avaliações", "Os clientes avaliam no fim e são convidados a avaliar no Google."],
] as const;

/** Página que o dono do restaurante recebe: a ementa dele já digital, em 5 línguas, e "Quero ativar". */
export function MenuPreviewView({ token, restaurantName, menu, translations }: { token: string; restaurantName: string; menu: Menu; translations: Translations }) {
  const [lang, setLang] = useState<Lang>("pt");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  // Conta a visita a partir do navegador (as pré-visualizações automáticas de links não correm isto).
  useEffect(() => {
    void fetch(`/api/p/${token}/vista`, { method: "POST" }).catch(() => null);
  }, [token]);

  async function activate() {
    setState("sending");
    setError(null);
    const res = await fetch(`/api/p/${token}/ativar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact: contact.trim() || undefined }),
    }).catch(() => null);
    if (res?.ok || res?.status === 429) return setState("sent");
    setState("idle");
    setError((res && (await res.json().catch(() => ({}))).message) || "Sem ligação. Tente de novo.");
  }

  const available = LANGS.filter((l) => l.id === "pt" || translations[l.id]);
  const text = (ref: string, name: string, description?: string | null) => {
    const t = lang === "pt" ? undefined : translations[lang]?.[ref];
    return { name: t?.name ?? name, description: t ? (t.description ?? description ?? undefined) : (description ?? undefined) };
  };

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <div className="bg-brand px-4 py-3 text-sm text-white">
        Pré-visualização preparada pela MESVIO para <strong>{restaurantName}</strong>. Ainda não está publicada: só quem tem este link a vê.
      </div>

      <header className="px-4 pt-6 pb-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight">{restaurantName}</h1>
        <p className="mt-1 text-sm text-ink-soft">Assim veem os seus clientes a ementa, ao ler o QR Code da mesa.</p>
        {available.length > 1 && (
          <div className="mt-4 flex gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Língua">
            {available.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={lang === l.id}
                onClick={() => setLang(l.id)}
                className={`min-h-10 shrink-0 rounded-full border px-3.5 text-sm ${lang === l.id ? "border-brand bg-brand text-white" : "border-line bg-card"}`}
              >
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="px-4">
        {menu.categories.map((c, ci) => (
          <section key={ci} className="mt-6">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">{text(`c${ci}`, c.name).name}</h2>
            <ul className="mt-3 grid gap-3">
              {c.products.map((p, pi) => {
                const t = text(`p${ci}-${pi}`, p.name, p.description);
                return (
                  <li key={pi} className="flex gap-3 rounded-2xl border border-line bg-card p-3">
                    {p.imageUrl && (
                      // Foto do prato no site do restaurante.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-20 shrink-0 rounded-xl object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold">{t.name}</p>
                        {p.priceCents !== null && <p className="shrink-0 font-semibold tabular-nums">{formatEur(p.priceCents)}</p>}
                      </div>
                      {t.description && <p className="mt-0.5 text-sm text-ink-soft">{t.description}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section className="mt-10 rounded-3xl border border-line bg-card p-5">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">O que vem com a MESVIO</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {FEATURES.map(([icon, title, body]) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden="true" className="text-2xl">
                  {icon}
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-ink-soft">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-3xl bg-brand p-5 text-white" aria-live="polite">
          {state === "sent" ? (
            <>
              <h2 className="font-[family-name:var(--font-display)] text-2xl">Obrigado! 🎉</h2>
              <p className="mt-2">Recebemos o seu pedido. Entramos em contacto muito em breve para pôr a ementa a funcionar no {restaurantName}.</p>
            </>
          ) : (
            <>
              <h2 className="font-[family-name:var(--font-display)] text-2xl">Quer esta ementa no {restaurantName}?</h2>
              <p className="mt-2 text-white/85">A ementa já está feita. Reveja connosco os preços e os alergénios e fica a funcionar em poucos minutos.</p>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={200}
                placeholder="O seu telemóvel ou email (opcional)"
                aria-label="O seu telemóvel ou email (opcional)"
                className="mt-4 min-h-12 w-full rounded-xl border-0 bg-white px-4 text-ink"
              />
              <button type="button" onClick={activate} disabled={state === "sending"} className="mt-3 min-h-12 w-full rounded-xl bg-mint px-5 font-semibold text-brand disabled:opacity-60">
                {state === "sending" ? "A enviar…" : "Quero ativar"}
              </button>
              {error && (
                <p role="alert" className="mt-2 text-sm text-white">
                  {error}
                </p>
              )}
              <p className="mt-3 text-xs text-white/70">Os preços foram lidos da sua ementa e podem ter pequenos erros: revemos tudo consigo antes de publicar. O contacto serve só para lhe responder.</p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
