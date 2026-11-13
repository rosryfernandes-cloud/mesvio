"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/i18n-provider";
import { apiErrorText } from "@/lib/i18n/messages";

/**
 * Avaliação do cliente: estrelas e comentário opcional (só o restaurante vê). O botão do
 * Google aparece a todos, seja qual for a nota (filtrar por nota é proibido).
 */
export function ReviewPrompt({ tableToken, googleUrl }: { tableToken: string; googleUrl: string | null }) {
  const { locale, t } = useI18n();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    const res = await fetch(`/api/mesa/${tableToken}/avaliacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars, comment: comment.trim() }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setSending(false);
    // Limite atingido = esta pessoa já avaliou: agradece na mesma.
    if (res?.ok || res?.status === 429) return setSent(true);
    setError(res ? apiErrorText(t, locale, data, t.apiError.generic) : t.apiError.generic);
  }

  return (
    <section className="mt-4 rounded-2xl border border-line bg-card px-5 py-4">
      {sent ? (
        <p role="status" className="font-semibold text-ok">{t.review.thanks}</p>
      ) : (
        <>
          <p className="font-semibold">{t.review.title}</p>
          <div className="mt-2 flex gap-1" role="radiogroup" aria-label={t.review.title}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={t.review.starLabel(n)}
                onClick={() => setStars(n)}
                className={`flex size-11 items-center justify-center text-3xl leading-none ${n <= stars ? "text-amber-500" : "text-line"}`}
              >
                ★
              </button>
            ))}
          </div>
          {stars > 0 && (
            <>
              <label className="mt-3 block text-sm">
                {stars <= 3 ? t.review.commentBad : t.review.commentGood}
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 1000))}
                  rows={3}
                  className="mt-1 block w-full rounded-xl border border-line bg-paper px-3 py-2.5"
                />
              </label>
              <button
                type="button"
                disabled={sending}
                onClick={send}
                className="mt-3 min-h-11 w-full rounded-xl bg-brand px-4 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                {t.review.send}
              </button>
              {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
            </>
          )}
        </>
      )}
      {googleUrl && (
        <div className="mt-4 border-t border-line pt-4">
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center rounded-xl border border-line bg-paper px-4 py-2.5 font-semibold"
          >
            {t.review.google}
          </a>
          <p className="mt-1 text-center text-xs text-ink-soft">{t.review.googleHint}</p>
        </div>
      )}
    </section>
  );
}

/** Botão "Deixar uma avaliação" (ementa e conta, em todos os planos): abre a avaliação numa janela. */
export function ReviewButton({ tableToken, googleUrl }: { tableToken: string; googleUrl: string | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-5 font-semibold hover:border-brand hover:text-brand"
      >
        <span aria-hidden="true" className="text-amber-500">★</span> {t.review.cta}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        aria-label={t.review.title}
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-3xl bg-paper p-4 text-left text-ink backdrop:bg-black/40"
      >
        <div className="flex justify-end">
          <button type="button" onClick={() => setOpen(false)} aria-label={t.product.close} className="-mt-1 -mr-1 p-2 text-2xl leading-none text-ink-soft">
            ×
          </button>
        </div>
        {open && <ReviewPrompt tableToken={tableToken} googleUrl={googleUrl} />}
      </dialog>
    </>
  );
}
