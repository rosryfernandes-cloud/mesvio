"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type GoTab = "carta" | "ementa" | "equipa";

const storageKey = (establishmentId: string) => `mesvio:primeiros-passos:${establishmentId}`;

interface Saved {
  hidden?: boolean;
  qr?: boolean;
  testOrder?: boolean;
}

function readSaved(establishmentId: string): Saved {
  try {
    return JSON.parse(localStorage.getItem(storageKey(establishmentId)) ?? "{}") as Saved;
  } catch {
    return {};
  }
}

function writeSaved(establishmentId: string, next: Saved) {
  try {
    localStorage.setItem(storageKey(establishmentId), JSON.stringify(next));
  } catch {
    // sem armazenamento local: a lista volta a aparecer da próxima vez
  }
}

/** O que já se sabe pelo servidor. `menu` é null em restaurantes ligados a um POS, que não editam a ementa aqui. */
interface Status {
  menu: boolean | null;
  logo: boolean;
  team: boolean;
}

/**
 * Primeiros passos para o dono ou gerente de um restaurante novo. Os passos marcam-se sozinhos
 * sempre que o servidor sabe a resposta; imprimir os QR e o pedido de teste ficam neste aparelho.
 */
export function FirstSteps({
  establishmentId,
  hasOrders,
  refreshKey,
  onGo,
}: {
  establishmentId: string;
  hasOrders: boolean;
  refreshKey: string;
  onGo: (tab: GoTab) => void;
}) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    setSaved(readSaved(establishmentId));
  }, [establishmentId]);

  // Volta a ver o estado ao mudar de separador: quem acaba de criar um prato vê o passo marcado.
  const hidden = saved === null || Boolean(saved.hidden);
  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    void (async () => {
      const load = async (url: string) => {
        const res = await fetch(url, { cache: "no-store" }).catch(() => null);
        return res?.ok ? res.json().catch(() => null) : null;
      };
      const [carta, marca, equipa] = await Promise.all([load("/api/painel/carta"), load("/api/painel/marca"), load("/api/painel/equipa")]);
      if (cancelled || !carta || !marca || !equipa) return;
      const categories: { products: unknown[] }[] = carta.menu?.categories ?? [];
      setStatus({
        menu: carta.ownMenu ? categories.some((c) => c.products.length > 0) : null,
        logo: Boolean(marca.brandLogoUrl),
        team: equipa.members.length > 1,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [hidden, refreshKey]);

  function update(patch: Saved) {
    const next = { ...(saved ?? {}), ...patch };
    setSaved(next);
    writeSaved(establishmentId, next);
  }

  // O pedido de teste fica registado: amanhã, sem pedidos, o passo não pode voltar atrás.
  useEffect(() => {
    if (hasOrders && saved && !saved.testOrder) update({ testOrder: true });
  }, [hasOrders, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!saved || saved.hidden || !status) return null;

  const steps = [
    ...(status.menu === null
      ? []
      : [{ id: "menu", done: status.menu, title: "Crie a ementa", text: "Categorias, pratos e preços.", action: "Abrir Ementa", tab: "carta" as const }]),
    { id: "logo", done: status.logo, title: "Ponha o logótipo", text: "Para a ementa ficar com a imagem do seu espaço.", action: "Abrir Aparência", tab: "ementa" as const },
    { id: "qr", done: Boolean(saved.qr), title: "Imprima os QR", text: "Um para cada mesa ou espreguiçadeira.", action: "Abrir QR Codes", href: "/painel/qr" },
    { id: "test", done: Boolean(saved.testOrder) || hasOrders, title: "Faça um pedido de teste", text: "Leia um QR com o telemóvel, faça um pedido e confirme que ouve o som aqui." },
    { id: "team", done: status.team, title: "Convide a equipa", text: "Cada pessoa entra com o seu email.", action: "Abrir Equipa", tab: "equipa" as const },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <details open={!hasOrders} className="mb-4 rounded-2xl border border-line bg-card p-4">
      <summary className="flex min-h-8 cursor-pointer items-center justify-between gap-3 font-semibold">
        <span>Primeiros passos</span>
        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-sm text-brand tabular-nums">
          {doneCount} de {steps.length}
        </span>
      </summary>
      <ol className="mt-3 grid gap-2">
        {steps.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5">
            <span
              aria-hidden="true"
              className={`grid size-6 shrink-0 place-items-center rounded-full border text-sm font-bold ${s.done ? "border-ok bg-ok text-white" : "border-line"}`}
            >
              {s.done ? "✓" : ""}
            </span>
            <span className="min-w-40 flex-1">
              <span className={`block font-semibold ${s.done ? "text-ink-soft line-through" : ""}`}>
                {s.title}
                <span className="sr-only">{s.done ? " (feito)" : " (por fazer)"}</span>
              </span>
              {!s.done && <span className="block text-sm text-ink-soft">{s.text}</span>}
            </span>
            {!s.done && s.tab && (
              <button type="button" onClick={() => onGo(s.tab)} className="min-h-10 rounded-xl border border-brand px-3 text-sm font-semibold text-brand">
                {s.action}
              </button>
            )}
            {!s.done && s.href && (
              <Link href={s.href} onClick={() => update({ qr: true })} className="inline-flex min-h-10 items-center rounded-xl border border-brand px-3 text-sm font-semibold text-brand">
                {s.action}
              </Link>
            )}
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => update({ hidden: true })} className="mt-3 min-h-10 text-sm text-ink-soft underline">
        Esconder esta lista
      </button>
    </details>
  );
}
