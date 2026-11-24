"use client";

import { Fragment, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; text: string };

const EXAMPLES = ["Como estão os restaurantes?", "Quem abriu os links de demonstração esta semana?", "Que alertas tenho para resolver?", "Como ligo um restaurante à ZoneSoft?"];
const STORE = "mesvio-central-ajudante";

/** Negrito simples (**texto**) nas respostas; o resto fica como texto. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

/**
 * Ajudante da Central: botão fixo no canto que abre uma conversa. Responde com os dados reais da
 * plataforma (restaurantes, pedidos, alertas, links de demonstração) e explica como fazer as coisas.
 * Só lê. A conversa fica guardada neste separador do navegador até o fechar.
 */
export function CentralAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setMessages(JSON.parse(saved) as Message[]);
    } catch {
      // Sem armazenamento: a conversa começa vazia.
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-30)));
    } catch {
      // Sem armazenamento: não faz mal.
    }
  }, [messages]);
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy, open]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history = messages.slice(-10);
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    setBusy(true);
    const res = await fetch("/api/central/assistente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, history }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    setMessages((m) => [...m, { role: "assistant", text: res?.ok ? d.answer : (d.message ?? "Sem ligação. Tenta de novo.") }]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-brand px-5 font-semibold text-white shadow-lg hover:opacity-95"
      >
        <span aria-hidden="true">🤖</span> Ajudante
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-label="Ajudante da Central"
        className="m-auto w-[min(40rem,calc(100%-2rem))] rounded-3xl border border-line bg-paper p-0 text-ink backdrop:bg-black/40"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-xl">🤖 Ajudante</h2>
              <p className="text-sm text-ink-soft">Pergunta pelos restaurantes, pedidos, alertas e links de demonstração, ou como fazer alguma coisa.</p>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button type="button" onClick={() => setMessages([])} className="min-h-9 rounded-lg px-2 text-sm text-ink-soft underline">
                  Nova conversa
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="-mt-1 -mr-2 p-2 text-2xl leading-none text-ink-soft">
                ×
              </button>
            </div>
          </div>
          <div className="grid flex-1 content-start gap-3 overflow-y-auto px-5 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="grid gap-2">
                {EXAMPLES.map((e) => (
                  <button key={e} type="button" onClick={() => void ask(e)} className="min-h-10 rounded-xl border border-line bg-card px-3 text-left text-sm">
                    {e}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <p
                key={i}
                className={`max-w-[88%] rounded-2xl px-4 py-2.5 whitespace-pre-line ${m.role === "user" ? "justify-self-end bg-brand text-white" : "justify-self-start bg-card"}`}
              >
                {m.role === "assistant" ? <Rich text={m.text} /> : m.text}
              </p>
            ))}
            {busy && <p className="justify-self-start rounded-2xl bg-card px-4 py-2.5 text-ink-soft">A ver os dados…</p>}
            <div ref={endRef} />
          </div>
          <form
            className="flex gap-2 border-t border-line px-5 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={1000}
              placeholder="Escreve a tua pergunta"
              aria-label="A tua pergunta"
              className="min-h-11 flex-1 rounded-xl border border-line bg-card px-3"
            />
            <button type="submit" disabled={busy || question.trim().length < 2} className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-50">
              Perguntar
            </button>
          </form>
          <p className="px-5 pb-3 text-xs text-ink-soft">Usa os dados atuais da Central. Só lê: para mudar alguma coisa, diz-te onde carregar.</p>
        </div>
      </dialog>
    </>
  );
}
