"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { outreachEmail, outreachShortText, outreachSubject } from "@/lib/outreach-email";

export type PreviewRow = {
  id: string;
  token: string;
  restaurantName: string;
  notes: string | null;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  lastViewedAt: string | null;
  activationRequestedAt: string | null;
  activationContact: string | null;
};

const when = (iso: string) => new Date(iso).toLocaleString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });

/** Pré-visualizações enviadas: quem abriu, quem quer ativar, copiar o link ou apagar. */
export function PreviewList({ rows, baseUrl, sender }: { rows: PreviewRow[]; baseUrl: string; sender: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const now = Date.now();

  const flash = (key: string) => {
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(key);
    } catch {
      window.prompt("Copie o texto:", text);
    }
  }

  /** Copia o email já formatado (com as imagens), para colar no Gmail. */
  async function copyEmail(r: PreviewRow) {
    const { html, text } = outreachEmail({ restaurant: r.restaurantName, url: `${baseUrl}/p/${r.token}`, sender, baseUrl });
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      flash(`email-${r.id}`);
    } catch {
      await copyText(`email-${r.id}`, text);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Apagar esta pré-visualização? O link deixa de funcionar.")) return;
    setBusy(id);
    await fetch(`/api/central/previsualizacoes?id=${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    router.refresh();
  }

  if (rows.length === 0) return <p className="mt-3 text-sm text-ink-soft">Ainda não enviou nenhuma. Crie a primeira acima.</p>;

  // Primeiro quem quer ativar, depois quem abriu (mais recente primeiro), depois o resto.
  const sorted = [...rows].sort(
    (a, b) =>
      Number(!!b.activationRequestedAt) - Number(!!a.activationRequestedAt) ||
      (b.lastViewedAt ?? "").localeCompare(a.lastViewedAt ?? "") ||
      b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <ul className="mt-3 grid gap-2">
      {sorted.map((r) => {
        const expired = new Date(r.expiresAt).getTime() <= now;
        return (
          <li key={r.id} className={`rounded-2xl border p-4 ${r.activationRequestedAt ? "border-ok bg-[#ecfdf3]" : "border-line bg-card"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {r.restaurantName}
                  {r.activationRequestedAt && <span className="ml-2 rounded-full bg-ok px-2 py-0.5 text-xs text-white">Quer ativar</span>}
                  {expired && <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-xs">Expirou</span>}
                </p>
                <p className="text-sm text-ink-soft">
                  Criada {when(r.createdAt)} ·{" "}
                  {r.viewCount > 0 ? `Aberta ${r.viewCount}× (última ${when(r.lastViewedAt!)})` : "Ainda não abriu"}
                </p>
                {r.activationContact && <p className="text-sm font-semibold">Contacto: {r.activationContact}</p>}
                {r.notes && <p className="text-sm text-ink-soft italic">{r.notes}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {!expired && (
                  <>
                    <button type="button" onClick={() => copyText(r.token, `${baseUrl}/p/${r.token}`)} className="min-h-10 rounded-xl border border-line bg-paper px-3 text-sm font-semibold">
                      {copied === r.token ? "Copiado ✓" : "Copiar link"}
                    </button>
                    <button type="button" onClick={() => copyText(`subj-${r.id}`, outreachSubject(r.restaurantName))} className="min-h-10 rounded-xl border border-line bg-paper px-3 text-sm font-semibold">
                      {copied === `subj-${r.id}` ? "Copiado ✓" : "Assunto"}
                    </button>
                    <button type="button" onClick={() => copyEmail(r)} className="min-h-10 rounded-xl bg-brand px-3 text-sm font-semibold text-white">
                      {copied === `email-${r.id}` ? "Copiado ✓" : "Copiar email"}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyText(`wa-${r.id}`, outreachShortText({ restaurant: r.restaurantName, url: `${baseUrl}/p/${r.token}`, sender }))}
                      className="min-h-10 rounded-xl border border-line bg-paper px-3 text-sm font-semibold"
                    >
                      {copied === `wa-${r.id}` ? "Copiado ✓" : "WhatsApp / Instagram"}
                    </button>
                    <a href={`/p/${r.token}`} target="_blank" rel="noopener" className="flex min-h-10 items-center rounded-xl border border-line bg-paper px-3 text-sm font-semibold">
                      Abrir
                    </a>
                  </>
                )}
                <button type="button" onClick={() => remove(r.id)} disabled={busy === r.id} className="min-h-10 rounded-xl px-3 text-sm text-danger underline">
                  Apagar
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
