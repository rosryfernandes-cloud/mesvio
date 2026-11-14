"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; text: string };

const EXAMPLES = ["Como mudo o preço de um prato?", "Como imprimo os QR das mesas?", "Como ponho a ementa em espanhol?"];

/** "Precisa de ajuda?": botão no painel que abre uma conversa sobre como usar o painel. */
export function HelpAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history = messages.slice(-6);
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    setBusy(true);
    const res = await fetch("/api/painel/ajuda", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, history }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    setMessages((m) => [...m, { role: "assistant", text: res?.ok ? d.answer : (d.message ?? "Sem ligação. Tente de novo.") }]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-10 rounded-full border border-line bg-card px-4 text-sm font-semibold"
      >
        <span aria-hidden="true">💬</span> Precisa de ajuda?
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-label="Ajuda do painel"
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-3xl border border-line bg-paper p-0 text-ink backdrop:bg-black/40"
      >
        <div className="flex max-h-[80dvh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-xl">Precisa de ajuda?</h2>
              <p className="text-sm text-ink-soft">Pergunte como fazer qualquer coisa no painel.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="-mt-1 -mr-2 p-2 text-2xl leading-none text-ink-soft">
              ×
            </button>
          </div>
          <div className="grid flex-1 gap-3 overflow-y-auto px-5 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="grid gap-2">
                {EXAMPLES.map((e) => (
                  <button key={e} type="button" onClick={() => ask(e)} className="min-h-10 rounded-xl border border-line bg-card px-3 text-left text-sm">
                    {e}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <p
                key={i}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 whitespace-pre-line ${m.role === "user" ? "justify-self-end bg-brand text-white" : "justify-self-start bg-card"}`}
              >
                {m.text}
              </p>
            ))}
            {busy && <p className="justify-self-start rounded-2xl bg-card px-4 py-2.5 text-ink-soft">A pensar…</p>}
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
              maxLength={500}
              placeholder="Escreva a sua pergunta"
              aria-label="A sua pergunta"
              className="min-h-11 flex-1 rounded-xl border border-line bg-card px-3"
            />
            <button type="submit" disabled={busy || question.trim().length < 2} className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-50">
              Perguntar
            </button>
          </form>
          <p className="px-5 pb-3 text-xs text-ink-soft">Respostas automáticas. Para mudar o plano, faturação ou ligar um POS, fale com a equipa MESVIO.</p>
        </div>
      </dialog>
    </>
  );
}
