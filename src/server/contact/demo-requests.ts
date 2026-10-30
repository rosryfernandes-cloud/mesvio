import "server-only";
import { and, asc, eq, gt, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { demoRequests } from "@/server/db/schema";
import { hitRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/** Pedidos de demonstração da landing page (potenciais clientes da MESVIO). */

export const DEMO_REQUEST_LIMIT: RateLimitRule = { limit: 5, windowSeconds: 60 * 60 };

/** Conservação dos pedidos de demonstração (política de privacidade, ponto 2). */
export const DEMO_REQUEST_RETENTION_DAYS = 365;

/** Apaga pedidos de demonstração mais antigos do que o prazo de conservação. Chamado pelo worker/cron. */
export async function pruneDemoRequests(db: Db, now = new Date()): Promise<void> {
  await db.delete(demoRequests).where(lt(demoRequests.createdAt, new Date(now.getTime() - DEMO_REQUEST_RETENTION_DAYS * 86_400_000)));
}

/**
 * Pedidos guardados cujo email não saiu (ex.: domínio ainda por verificar na Resend): volta a
 * tentar nas tarefas de fundo, até 2 dias depois. Devolve quantos foram avisados agora.
 */
export async function retryDemoRequestEmails(db: Db, { notify = sendDemoRequestEmail, now = new Date() }: { notify?: Notifier; now?: Date } = {}): Promise<number> {
  if (!process.env.RESEND_API_KEY || !process.env.DEMO_REQUESTS_TO || !process.env.DEMO_REQUESTS_FROM) return 0;
  const pending = await db
    .select()
    .from(demoRequests)
    .where(and(isNull(demoRequests.notifiedAt), gt(demoRequests.createdAt, new Date(now.getTime() - 2 * 86_400_000))))
    .orderBy(asc(demoRequests.createdAt))
    .limit(5);
  let sent = 0;
  for (const r of pending) {
    if (await notify(r).catch(() => false)) {
      await db.update(demoRequests).set({ notifiedAt: now }).where(eq(demoRequests.id, r.id));
      sent++;
    }
  }
  return sent;
}

export const VENUE_TYPES = ["Restaurante", "Bar de praia", "Hotel", "Piscina", "Outro"] as const;

const text = (max: number) => z.string().trim().max(max);

export const demoRequestSchema = z.object({
  name: text(120).min(2, "Indica o teu nome."),
  business: text(160).min(2, "Indica o nome do espaço."),
  email: z.email("Indica um email válido.").max(200),
  phone: text(40).regex(/^[+\d\s()-]*$/, "Telefone inválido.").optional().or(z.literal("")),
  venueType: z.enum(VENUE_TYPES).optional().or(z.literal("")),
  message: text(2000).optional(),
  /** Campo escondido: as pessoas não o veem; os robôs preenchem-no. */
  website: z.string().max(200).optional(),
});

export type DemoRequestInput = z.input<typeof demoRequestSchema>;

export type DemoRequestResult =
  | { ok: true; notified: boolean }
  | { ok: false; code: "INVALID_INPUT"; message: string }
  | { ok: false; code: "RATE_LIMITED"; retryAfterSeconds: number };

export interface Notifier {
  (request: typeof demoRequests.$inferSelect): Promise<boolean>;
}

export async function createDemoRequest(
  db: Db,
  input: unknown,
  { ipHash, notify = sendDemoRequestEmail }: { ipHash: string; notify?: Notifier },
): Promise<DemoRequestResult> {
  const parsed = demoRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  // Robô: responder como se tivesse corrido bem, sem guardar nada.
  if (parsed.data.website) return { ok: true, notified: false };

  const limit = await hitRateLimit(db, `demo:${ipHash}`, DEMO_REQUEST_LIMIT);
  if (!limit.allowed) return { ok: false, code: "RATE_LIMITED", retryAfterSeconds: limit.retryAfterSeconds };

  const d = parsed.data;
  const [row] = await db
    .insert(demoRequests)
    .values({
      name: d.name,
      business: d.business,
      email: d.email.toLowerCase(),
      phone: d.phone || null,
      venueType: d.venueType || null,
      message: d.message || null,
      ipHash,
    })
    .returning();

  // O pedido já está guardado: uma falha no email não o perde (fica com notified_at a null).
  const notified = await notify(row).catch(() => false);
  if (notified) await db.update(demoRequests).set({ notifiedAt: new Date() }).where(eq(demoRequests.id, row.id));
  return { ok: true, notified };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Aviso por email à equipa via Resend (resend.com), se configurado:
 * RESEND_API_KEY, DEMO_REQUESTS_TO (quem recebe) e DEMO_REQUESTS_FROM (remetente de um domínio
 * verificado na Resend). Sem configuração, devolve false e o pedido fica só na base de dados.
 */
export async function sendDemoRequestEmail(r: typeof demoRequests.$inferSelect): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.DEMO_REQUESTS_TO;
  const from = process.env.DEMO_REQUESTS_FROM;
  if (!key || !to || !from) return false;

  const rows: [string, string | null][] = [
    ["Nome", r.name],
    ["Espaço", r.business],
    ["Tipo", r.venueType],
    ["Email", r.email],
    ["Telefone", r.phone],
    ["Mensagem", r.message],
  ];
  const html =
    `<h2 style="font-family:Arial,sans-serif">Novo pedido de demonstração</h2><table style="font-family:Arial,sans-serif;font-size:14px">` +
    rows
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#4b5b56">${k}</td><td style="padding:4px 0">${escapeHtml(v!).replace(/\n/g, "<br>")}</td></tr>`)
      .join("") +
    `</table>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: to.split(",").map((s) => s.trim()),
      reply_to: r.email,
      subject: `Pedido de demonstração: ${r.business}`.slice(0, 150),
      html,
      text: rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n"),
    }),
    signal: AbortSignal.timeout(8000),
  });
  // O motivo da Resend fica nos registos da Vercel (ex.: remetente de um domínio por verificar).
  if (!res.ok) console.error("[demonstração] email recusado pela Resend", res.status, (await res.text().catch(() => "")).slice(0, 300));
  return res.ok;
}
