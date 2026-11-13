import "server-only";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { establishments, memberships, staffProfiles } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import { formatEur } from "@/lib/money";
import { getWeekSummary, type WeekSummary } from "./summary-service";

/**
 * Resumo da semana por email aos donos, às segundas-feiras às 8h (Lisboa), para os restaurantes que
 * o ligaram no painel. Corre nas tarefas de fundo (a cada minuto); fora da janela não faz nada.
 */
const SEND_HOUR = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Segunda-feira entre as 8h e as 12h em Lisboa (se uma execução falhar, a seguinte apanha). */
export function inSendWindow(now: Date): boolean {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour);
  return parts.weekday === "Mon" && hour >= SEND_HOUR && hour < 12;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const weekday = (date: string) =>
  new Intl.DateTimeFormat("pt-PT", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

function versus(now: number, before: number): string {
  if (before <= 0) return "";
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? " (igual à semana anterior)" : ` (${pct > 0 ? "+" : ""}${pct}% que na semana anterior)`;
}

/** Texto do email (assunto, HTML e texto simples). Só números do restaurante: nada inventado. */
export function renderWeeklyEmail(restaurant: string, w: WeekSummary, appUrl: string): { subject: string; html: string; text: string } {
  const best = w.orders ? w.byDay.reduce((a, b) => (b.salesCents > a.salesCents ? b : a)) : null;
  const busiest = w.byHour.length ? w.byHour.reduce((a, b) => (b.orders > a.orders ? b : a)) : null;
  const lines = [
    `Pedidos: ${w.orders}${versus(w.orders, w.previous.orders)}`,
    `Vendas (com IVA): ${formatEur(w.salesCents)}${versus(w.salesCents, w.previous.salesCents)}`,
    w.orders ? `Ticket médio: ${formatEur(w.averageTicketCents)}` : null,
    best ? `Melhor dia: ${weekday(best.date)}, com ${formatEur(best.salesCents)}` : null,
    busiest ? `Hora de mais movimento: ${String(busiest.hour).padStart(2, "0")}h–${String((busiest.hour + 1) % 24).padStart(2, "0")}h` : null,
    w.topProducts.length ? `Mais pedidos: ${w.topProducts.slice(0, 3).map((p) => `${p.name} (${p.quantity}×)`).join(", ")}` : null,
    w.soldOutOften.length ? `Esgotou várias vezes: ${w.soldOutOften.map((p) => p.name).join(", ")}. Vale a pena encomendar mais.` : null,
    w.notOrdered.length ? `Ninguém pediu: ${w.notOrdered.join(", ")}. Uma foto ou uma descrição pode ajudar.` : null,
  ].filter((l): l is string => !!l);
  const link = `${appUrl.replace(/\/+$/, "")}/painel`;
  const subject = `${restaurant}: a sua semana na MESVIO`.slice(0, 150);
  const html = `<div style="background:#F7F5F0;padding:32px 16px;font-family:Manrope,'Segoe UI',Arial,sans-serif;color:#10211D">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:20px;overflow:hidden">
    <div style="background:#062D25;padding:22px 28px;font-size:24px;font-weight:800;color:#FFFFFF">mesvio<span style="color:#91E9C3">.</span></div>
    <div style="padding:28px">
      <p style="margin:0 0 6px;font-size:14px;color:#4B5B56">Últimos 7 dias</p>
      <h1 style="margin:0 0 20px;font-size:22px">${escapeHtml(restaurant)}</h1>
      <ul style="margin:0 0 24px;padding-left:20px;font-size:16px;line-height:1.6">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
      <a href="${link}" style="display:inline-block;background:#062D25;color:#FFFFFF;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px">Ver o resumo no painel</a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#4B5B56">Contam os pedidos feitos pela MESVIO que chegaram à cozinha. Para deixar de receber este email, desligue-o no separador Resumo do painel.</p>
    </div>
  </div>
</div>`;
  const text = `${restaurant} — últimos 7 dias\n\n${lines.map((l) => `• ${l}`).join("\n")}\n\nVer no painel: ${link}\n\nPara deixar de receber este email, desligue-o no separador Resumo do painel.`;
  return { subject, html, text };
}

export type EmailSender = (msg: { to: string[]; subject: string; html: string; text: string }) => Promise<boolean>;

const resendSender: EmailSender = async ({ to, subject, html, text }) => {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.WEEKLY_SUMMARY_FROM ?? process.env.DEMO_REQUESTS_FROM;
  if (!key || !from) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) console.error("[resumo semanal] email recusado pela Resend", res.status);
  return res.ok;
};

/** Envia os resumos em falta desta semana. Devolve quantos restaurantes receberam. */
export async function sendWeeklySummaries(db: Db, now = new Date(), send: EmailSender = resendSender): Promise<number> {
  if (!inSendWindow(now)) return 0;
  const due = await db
    .select({ id: establishments.id, organizationId: establishments.organizationId, name: establishments.name })
    .from(establishments)
    .where(
      and(
        eq(establishments.weeklySummaryEmail, true),
        or(isNull(establishments.weeklySummarySentAt), lt(establishments.weeklySummarySentAt, new Date(now.getTime() - 6 * DAY_MS))),
      ),
    )
    .limit(50);
  let sent = 0;
  for (const e of due) {
    try {
      const owners = await db
        .select({ userId: memberships.userId, email: staffProfiles.email })
        .from(memberships)
        .innerJoin(staffProfiles, eq(staffProfiles.userId, memberships.userId))
        .where(
          and(
            eq(memberships.organizationId, e.organizationId),
            eq(memberships.role, "owner"),
            or(isNull(memberships.establishmentId), eq(memberships.establishmentId, e.id)),
          ),
        );
      // Marca já como tratado: um erro de envio não pode fazer repetir o email a cada minuto.
      await db.update(establishments).set({ weeklySummarySentAt: now }).where(eq(establishments.id, e.id));
      if (owners.length === 0) continue;
      const week = await getWeekSummary(db, { organizationId: e.organizationId, establishmentId: e.id, userId: owners[0].userId }, now);
      if (week.orders === 0 && week.previous.orders === 0) continue;
      const msg = renderWeeklyEmail(e.name, week, process.env.NEXT_PUBLIC_APP_URL ?? "https://mesvio.pt");
      if (await send({ to: [...new Set(owners.map((o) => o.email))], ...msg })) sent++;
    } catch (err) {
      console.error("[resumo semanal] falhou", e.id, err instanceof Error ? err.message : "erro");
    }
  }
  return sent;
}

/** Ligar ou desligar o email semanal (dono/gerente). */
export async function setWeeklySummaryEmail(db: Db, s: { organizationId: string; establishmentId: string; userId: string }, enabled: boolean): Promise<void> {
  await withTenant(db, { organizationId: s.organizationId, userId: s.userId }, (tx) =>
    tx.update(establishments).set({ weeklySummaryEmail: enabled }).where(eq(establishments.id, s.establishmentId)),
  );
}

export async function getWeeklySummaryEmail(db: Db, s: { organizationId: string; establishmentId: string; userId: string }): Promise<boolean> {
  const [row] = await withTenant(db, { organizationId: s.organizationId, userId: s.userId }, (tx) =>
    tx.select({ on: establishments.weeklySummaryEmail }).from(establishments).where(inArray(establishments.id, [s.establishmentId])),
  );
  return row?.on ?? false;
}
