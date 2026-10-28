import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { getStaffContext } from "@/server/staff/http";
import { getBoard } from "@/server/staff/staff-service";
import { formatEur } from "@/lib/money";
import { STATION_LABEL, STATIONS, type Station } from "@/lib/station";
import { AutoPrint } from "./auto-print";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Talão", robots: { index: false, follow: false } };

/**
 * Talão de cozinha (papel de 80 mm): mesa, número, hora, artigos com opções e notas. Abre-se pelo
 * botão "Talão" de cada pedido, ou sozinho (impressão automática no painel, com ?auto=1).
 * Com ?posto=kitchen|bar só leva os artigos desse posto (talão da cozinha ou do bar).
 */
export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string; posto?: string }> }) {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/painel/entrar");
  const { id } = await params;
  const { auto, posto } = await searchParams;
  const station = STATIONS.includes(posto as Station) ? (posto as Station) : null;
  if (!z.uuid().safeParse(id).success) notFound();
  const board = await getBoard(await getDb(), ctx);
  const o = board.orders.find((x) => x.id === id);
  if (!o) notFound();
  const lines = station ? o.lines.filter((l) => l.station === station) : o.lines;
  const time = new Date(o.createdAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });

  return (
    <main className="ticket">
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        html, body { background: #fff !important; }
        .ticket { width: 72mm; margin: 0 auto; padding: 4mm 0 8mm; font-family: ui-monospace, Menlo, Consolas, monospace; color: #000; font-size: 13px; line-height: 1.35; }
        .ticket h1 { font-size: 26px; font-weight: 800; margin: 0; }
        .ticket .big { font-size: 20px; font-weight: 800; }
        .ticket hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
        .ticket ul { list-style: none; padding: 0; margin: 0; }
        .ticket li { margin: 4px 0; font-size: 16px; }
        .ticket .mods, .ticket .note { font-size: 13px; padding-left: 26px; }
        .ticket .note { font-style: italic; }
        @media screen { .ticket { margin-top: 16px; box-shadow: 0 0 0 1px #ddd; padding: 4mm; } }
      `}</style>
      <p>
        {board.establishmentName}
        {station && <strong> · {STATION_LABEL[station].toUpperCase()}</strong>}
      </p>
      <h1>{o.tableLabel}</h1>
      <p className="big">
        Pedido #{o.shortCode} · {time}
      </p>
      <hr />
      {lines.length === 0 && <p>Sem artigos para {station ? STATION_LABEL[station].toLowerCase() : "preparar"}.</p>}
      <ul>
        {lines.map((l, i) => (
          <li key={i}>
            <strong>{l.quantity}×</strong> {l.name}
            {l.modifierNames.length > 0 && <div className="mods">{l.modifierNames.join(", ")}</div>}
            {l.notes && <div className="note">“{l.notes}”</div>}
          </li>
        ))}
      </ul>
      {o.notes && (
        <>
          <hr />
          <p className="note">Nota: “{o.notes}”</p>
        </>
      )}
      <hr />
      {/* O valor só interessa no talão completo; o da cozinha/bar leva só o que há para preparar. */}
      {station ? <p>{lines.reduce((n, l) => n + l.quantity, 0)} artigo(s)</p> : <p>Total {formatEur(o.totalCents)}</p>}
      {auto === "1" && lines.length > 0 && <AutoPrint />}
    </main>
  );
}
