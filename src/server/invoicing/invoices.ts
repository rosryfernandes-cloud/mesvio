import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { auditLogs, establishments, orderItems, orders, payments } from "@/server/db/schema";
import { isValidNif } from "@/lib/nif";
import { open, seal } from "@/server/security/secret-box";
import type { StaffContext } from "@/server/staff/context";
import { InvoiceXpressClient, InvoiceXpressError, type Fetch, type InvoiceLine } from "./invoicexpress";

/**
 * Fatura por email: quando o cliente paga no telemóvel e pede fatura (NIF opcional, email), a
 * MESVIO pede a fatura-recibo ao programa certificado do restaurante (InvoiceXpress) e este envia-a.
 * A emissão corre nas tarefas de fundo (a cada minuto com o painel aberto), nunca no pagamento:
 * um programa de faturação lento ou em baixo não atrasa o cliente.
 */
type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

/** Pedidos que contam para a conta (os mesmos da comissão). */
const BILLABLE = ["SUBMITTED", "ACCEPTED", "IN_PREPARATION", "SERVED"] as const;

export const invoiceRequestSchema = z.object({
  nif: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || isValidNif(v), "NIF inválido.")
    .optional()
    .transform((v) => v || null),
  email: z.email().max(200).transform((e) => e.trim().toLowerCase()),
});
export type InvoiceRequestInput = z.input<typeof invoiceRequestSchema>;

// ─────────────────────────── Configuração (painel) ───────────────────────────

export async function getInvoicingSettings(db: Db, s: Scope): Promise<{ configured: boolean; account: string | null }> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [e] = await tx
      .select({ account: establishments.invoicingAccount, key: establishments.invoicingApiKeyCiphertext })
      .from(establishments)
      .where(eq(establishments.id, s.establishmentId));
    return { configured: Boolean(e?.account && e.key), account: e?.account ?? null };
  });
}

const settingsSchema = z.object({
  account: z
    .string()
    .trim()
    .toLowerCase()
    // Aceita o endereço inteiro (ex.: "restaurante.app.invoicexpress.com" ou ".web.") e fica só com o nome.
    .transform((v) => v.replace(/^https?:\/\//, "").replace(/\.(app|web)\.invoicexpress\.com.*$/, ""))
    .pipe(z.string().regex(/^[a-z0-9-]{2,60}$/, "Nome de conta inválido.")),
  apiKey: z.string().trim().min(10).max(200),
});

/** Liga (ou troca) a conta InvoiceXpress do restaurante, depois de confirmar que a chave funciona. */
export async function saveInvoicingSettings(
  db: Db,
  s: Scope,
  raw: unknown,
  { fetchImpl = fetch, verify = true }: { fetchImpl?: Fetch; verify?: boolean } = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Indique o nome da conta e a chave da API do InvoiceXpress." };
  const { account, apiKey } = parsed.data;
  if (verify) {
    try {
      await new InvoiceXpressClient(account, apiKey, fetchImpl).check();
    } catch {
      return { ok: false, message: "O InvoiceXpress não aceitou esta conta e chave. Confirme-as em Definições → API no InvoiceXpress." };
    }
  }
  await withTenant(db, tenantOf(s), async (tx) => {
    await tx
      .update(establishments)
      .set({ invoicingAccount: account, invoicingApiKeyCiphertext: seal(apiKey), updatedAt: new Date() })
      .where(eq(establishments.id, s.establishmentId));
    await tx.insert(auditLogs).values({
      organizationId: s.organizationId,
      actorType: "user",
      actorId: s.userId,
      action: "establishment.invoicing_connected",
      entityType: "establishment",
      entityId: s.establishmentId,
      after: { account },
    });
  });
  return { ok: true };
}

export async function removeInvoicingSettings(db: Db, s: Scope): Promise<void> {
  await withTenant(db, tenantOf(s), async (tx) => {
    await tx
      .update(establishments)
      .set({ invoicingAccount: null, invoicingApiKeyCiphertext: null, updatedAt: new Date() })
      .where(eq(establishments.id, s.establishmentId));
  });
}

/** Faturas dos últimos pagamentos (painel): emitidas, por tratar à mão e com erro. */
export async function recentInvoices(db: Db, s: Scope) {
  return withTenant(db, tenantOf(s), (tx) =>
    tx
      .select({ id: payments.id, status: payments.invoiceStatus, ref: payments.invoiceRef, error: payments.invoiceError, email: payments.invoiceEmail, nif: payments.invoiceNif, amountCents: payments.amountCents, tipCents: payments.tipCents, at: payments.updatedAt })
      .from(payments)
      .where(and(eq(payments.establishmentId, s.establishmentId), inArray(payments.invoiceStatus, ["pending", "issued", "failed", "manual"])))
      .orderBy(desc(payments.updatedAt))
      .limit(50),
  );
}

/**
 * "Tentar de novo" no painel: só para erros em que o InvoiceXpress recusou o pedido antes de criar
 * o documento (estado "failed"), por isso repetir não duplica faturas.
 */
export async function retryInvoice(db: Db, s: Scope, paymentId: string): Promise<boolean> {
  if (!z.uuid().safeParse(paymentId).success) return false;
  return withTenant(db, tenantOf(s), async (tx) => {
    const rows = await tx
      .update(payments)
      .set({ invoiceStatus: "pending", invoiceError: null })
      .where(and(eq(payments.id, paymentId), eq(payments.establishmentId, s.establishmentId), eq(payments.invoiceStatus, "failed")))
      .returning({ id: payments.id });
    return rows.length > 0;
  });
}

// ─────────────────────────── Emissão (tarefa de fundo) ───────────────────────────

/**
 * Erro do InvoiceXpress em português claro para o painel. "failed" = nada ficou criado e pode
 * tentar-se de novo; "manual" = a fatura pode ter ficado criada, confirma-se no programa.
 */
export function explainInvoiceError(err: unknown): { status: "failed" | "manual"; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const detail = raw.replace(/^InvoiceXpress \d+: /, "").slice(0, 200);
  if (err instanceof InvoiceXpressError && err.documentId) {
    return { status: "manual", message: `A fatura ficou criada no InvoiceXpress mas não foi finalizada ou enviada: termine-a lá. (${detail})` };
  }
  const status = err instanceof InvoiceXpressError ? err.status : null;
  if (status === 401 || status === 403) {
    return { status: "failed", message: "O InvoiceXpress não aceitou a chave da API. Ligue de novo a conta (Trocar chave) e tente outra vez." };
  }
  if (status !== null && status >= 400 && status < 500) {
    if (/contribuinte.*igual/i.test(detail)) {
      return { status: "failed", message: "O NIF do cliente é o do próprio restaurante, e o InvoiceXpress não deixa faturar a si próprio. Emita a fatura no programa com o NIF certo." };
    }
    if (/impost|tax/i.test(detail)) {
      return { status: "failed", message: `Falta uma taxa de IVA no InvoiceXpress (Configurações → Impostos): ${detail}` };
    }
    return { status: "failed", message: `O InvoiceXpress recusou a fatura: ${detail}` };
  }
  return { status: "manual", message: "O InvoiceXpress não respondeu a tempo. Confirme lá se a fatura foi criada; se não, emita-a à mão." };
}


const toLines = (items: (typeof orderItems.$inferSelect)[]): InvoiceLine[] =>
  items.map((i) => ({ name: i.name, quantity: i.quantity, unitGrossCents: Math.round(i.lineGrossCents / i.quantity), vatRateBps: i.vatRateBps }));

/**
 * O que a fatura leva: o pedido (lugares que pagam ao pedir) ou toda a conta da mesa, se este
 * pagamento a pagou de uma vez. Contas pagas em várias partes ficam para o restaurante faturar à
 * mão no programa dele (repartir artigos por pagamentos não é seguro de adivinhar).
 */
async function linesFor(systemDb: Db, p: typeof payments.$inferSelect): Promise<InvoiceLine[] | "split"> {
  if (p.orderId) {
    return toLines(await systemDb.select().from(orderItems).where(eq(orderItems.orderId, p.orderId)).orderBy(asc(orderItems.lineNo)));
  }
  const others = await systemDb.$count(
    payments,
    and(eq(payments.tableSessionId, p.tableSessionId), eq(payments.status, "SUCCEEDED"), ne(payments.id, p.id), isNull(payments.orderId)),
  );
  const sessionOrders = await systemDb
    .select({ id: orders.id, total: orders.totalGrossCents })
    .from(orders)
    .where(and(eq(orders.tableSessionId, p.tableSessionId), inArray(orders.status, [...BILLABLE])));
  const total = sessionOrders.reduce((n, o) => n + o.total, 0);
  if (others > 0 || p.amountCents - p.tipCents !== total || sessionOrders.length === 0) return "split";
  return toLines(
    await systemDb
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, sessionOrders.map((o) => o.id)))
      .orderBy(asc(orderItems.orderId), asc(orderItems.lineNo)),
  );
}

/** Emite as faturas pedidas em pagamentos já confirmados. Tarefa de sistema (todas as organizações). */
export async function issuePendingInvoices(systemDb: Db, { fetchImpl = fetch, limit = 20 }: { fetchImpl?: Fetch; limit?: number } = {}) {
  const rows = await systemDb
    .select({ payment: payments, account: establishments.invoicingAccount, key: establishments.invoicingApiKeyCiphertext })
    .from(payments)
    .innerJoin(establishments, eq(establishments.id, payments.establishmentId))
    .where(and(eq(payments.status, "SUCCEEDED"), eq(payments.invoiceStatus, "pending")))
    .limit(limit);
  let issued = 0;
  for (const { payment: p, account, key } of rows) {
    // Só um processo trata cada fatura (o painel e o cron podem correr ao mesmo tempo).
    const claimed = await systemDb
      .update(payments)
      .set({ invoiceStatus: "manual", invoiceError: "A emitir…" })
      .where(and(eq(payments.id, p.id), eq(payments.invoiceStatus, "pending")))
      .returning({ id: payments.id });
    if (claimed.length === 0) continue;
    const done = (values: Partial<typeof payments.$inferInsert>) => systemDb.update(payments).set(values).where(eq(payments.id, p.id));
    if (!account || !key) {
      await done({ invoiceStatus: "manual", invoiceError: "Faturação não ligada no painel." });
      continue;
    }
    const lines = await linesFor(systemDb, p);
    if (lines === "split") {
      await done({ invoiceStatus: "manual", invoiceError: "Conta paga em várias partes: emita a fatura no programa de faturação." });
      continue;
    }
    try {
      const r = await new InvoiceXpressClient(account, open(key), fetchImpl).issueInvoiceReceipt({
        nif: p.invoiceNif,
        email: p.invoiceEmail!,
        lines,
        reference: `MESVIO ${p.id.slice(0, 8)}`,
      });
      await done({ invoiceStatus: "issued", invoiceRef: r.number ?? r.id, invoiceError: null });
      issued++;
    } catch (err) {
      // Não se tenta outra vez sozinho: só o dono, no painel, e só se nada ficou criado.
      const e = explainInvoiceError(err);
      await done({ invoiceStatus: e.status, invoiceError: e.message.slice(0, 300) });
    }
  }
  return { checked: rows.length, issued };
}
