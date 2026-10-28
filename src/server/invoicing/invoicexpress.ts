import "server-only";

/**
 * Cliente mínimo da API do InvoiceXpress (programa de faturação certificado pela AT): a fatura
 * sai do programa do restaurante, com a série e a numeração dele; a MESVIO só pede a emissão.
 * Documentação: https://www.invoicexpress.com/api-v2 (faturas-recibo, mudar estado, enviar por email).
 */
export interface InvoiceLine {
  name: string;
  quantity: number;
  /** Preço unitário com IVA, em cêntimos (como está na ementa). */
  unitGrossCents: number;
  vatRateBps: number;
}

export interface InvoiceRequest {
  /** NIF do cliente; sem NIF é "consumidor final". */
  nif: string | null;
  email: string;
  lines: InvoiceLine[];
  /** Referência interna (aparece nas observações). */
  reference: string;
}

export type Fetch = typeof fetch;

/** Nome dos impostos que o InvoiceXpress cria nas contas portuguesas. */
const TAX_NAME: Record<number, string> = { 2300: "IVA23", 1300: "IVA13", 600: "IVA6", 0: "IVA0" };

const today = () => new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());

export class InvoiceXpressError extends Error {}

export class InvoiceXpressClient {
  constructor(
    private readonly account: string,
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    if (!/^[a-z0-9-]{2,60}$/i.test(account)) throw new InvoiceXpressError("Nome de conta InvoiceXpress inválido.");
  }

  private async call(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<unknown> {
    const url = `https://${this.account}.app.invoicexpress.com/${path}${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(this.apiKey)}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new InvoiceXpressError(`InvoiceXpress ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }

  /** Confirma a conta e a chave (uma leitura simples). */
  async check(): Promise<void> {
    await this.call("GET", "clients.json?per_page=1");
  }

  /** Emite (rascunho → finalizada) a fatura-recibo e envia-a por email. Devolve o id e o número. */
  async issueInvoiceReceipt(req: InvoiceRequest): Promise<{ id: string; number: string | null }> {
    const date = today();
    const created = (await this.call("POST", "invoice_receipts.json", {
      invoice_receipt: {
        date,
        due_date: date,
        observations: req.reference,
        client: {
          name: req.nif ? `Cliente ${req.nif}` : "Consumidor final",
          code: req.nif ?? `cf-${req.email.toLowerCase()}`,
          ...(req.nif ? { fiscal_id: req.nif } : {}),
          email: req.email,
        },
        items: req.lines.map((l) => ({
          name: l.name.slice(0, 120),
          // Preço sem IVA, com 4 casas para o total com IVA bater certo com o que o cliente pagou.
          unit_price: (l.unitGrossCents / (1 + l.vatRateBps / 10_000) / 100).toFixed(4),
          quantity: String(l.quantity),
          tax: { name: TAX_NAME[l.vatRateBps] ?? `IVA${l.vatRateBps / 100}` },
        })),
      },
    })) as { invoice_receipt?: { id?: number | string } };
    const id = created?.invoice_receipt?.id;
    if (id === undefined) throw new InvoiceXpressError("InvoiceXpress não devolveu o documento criado.");
    const finalized = (await this.call("PUT", `invoice_receipts/${id}/change-state.json`, { invoice_receipt: { state: "finalized" } })) as {
      invoice_receipt?: { inverted_sequence_number?: string; sequence_number?: string };
    } | null;
    await this.call("PUT", `invoice_receipts/${id}/email-document.json`, {
      message: { client: { email: req.email, save: "0" }, subject: "A sua fatura", body: "Obrigado pela visita! Segue em anexo a sua fatura-recibo." },
    });
    return { id: String(id), number: finalized?.invoice_receipt?.inverted_sequence_number ?? finalized?.invoice_receipt?.sequence_number ?? null };
  }
}
