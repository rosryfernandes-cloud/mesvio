/**
 * Regressão da auditoria de 23/10/2026 (../../../../auditoria-mesa-digital/AUDITORIA.md).
 * Cada teste descreve o comportamento correto que faltava; se voltar a falhar, o problema voltou.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { payments } from "@/server/db/schema";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import type { PosCapabilities, PosOrderRequest, PosOrderResult } from "@/server/pos/types";
import { placeOrder, type PlaceOrderDeps } from "@/server/orders/place-order";
import { runOutboxOnce } from "@/server/orders/outbox-worker";
import { getOrderForTable } from "@/server/orders/order-view";
import { getTableMenu } from "@/server/menu/get-table-menu";
import { createDbTableDirectory } from "@/server/tables/table-directory";
import { closeTable, getTableBillByToken, listTables } from "@/server/tables/table-sessions";
import { MockPaymentProvider } from "@/server/payments/provider";
import { reconcilePendingPayments, refreshTablePayment, startTablePayment } from "@/server/payments/table-payments";
import { resolveStaffContext, type StaffContext } from "@/server/staff/context";
import { applyStaffAction, setManualAcceptance } from "@/server/staff/staff-service";
import { clientIpFromHeaders } from "@/server/security/rate-limit";
import { authMode } from "@/server/auth/config";

const T1 = DEMO_TABLES[0];
let db: Db;
let pos: MockPosAdapter;
let deps: PlaceOrderDeps;
let provider: MockPaymentProvider;
let staff: StaffContext;
let manager: StaffContext;

beforeEach(async () => {
  db = await createTestDb();
  pos = new MockPosAdapter();
  deps = { db, resolvePos: () => pos, backoffMs: () => 0 };
  provider = new MockPaymentProvider();
  staff = (await resolveStaffContext(db, DEMO_USERS[2].userId))!;
  manager = (await resolveStaffContext(db, DEMO_USERS[1].userId))!;
});
afterEach(() => vi.unstubAllEnvs());

/** Imperial 0,2 L = 2,50 €. */
const order = (d: PlaceOrderDeps = deps) =>
  placeOrder(
    { tableToken: T1.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D361", quantity: 1 }] },
    { clientIpHash: randomUUID() },
    d,
  );

async function startPay() {
  const r = await startTablePayment(db, T1.publicToken, provider);
  if (!r.ok) throw new Error(r.message);
  const [row] = (await db.select().from(payments)).filter((p) => p.id === r.paymentId);
  return { id: r.paymentId, ref: row.providerRef };
}

describe("A1 — pagamentos pendentes simultâneos com valores diferentes cobram a mais", () => {
  it("o total pago nunca deve exceder o total da conta", async () => {
    await order();
    const a = await startPay(); // telemóvel A: 2,50 € (MB WAY pendente)
    await order(); //              nova ronda entretanto
    const b = await startPay(); // telemóvel B: 5,00 €
    provider.complete(a.ref, "mb_way");
    provider.complete(b.ref, "apple_pay");
    await refreshTablePayment(db, T1.publicToken, a.id, provider);
    const r = (await refreshTablePayment(db, T1.publicToken, b.id, provider))!;
    expect(r.bill.paidCents).toBeLessThanOrEqual(r.bill.totalCents); // falha: pago 750 de 500
  });
});

describe("A2 — fechar a mesa com um pagamento em curso", () => {
  it("não deve deixar fechar enquanto há um pagamento pendente", async () => {
    await order();
    await startPay(); // cliente está a aprovar no MB WAY
    const r = await closeTable(db, staff, T1.id);
    expect(r.ok).toBe(false); // falha: fecha, e o pagamento aprovado depois fica numa conta fechada
  });
});

describe("A3 — fecho forçado não cancela pedidos pendentes", () => {
  it("um pedido de uma mesa já fechada não deve chegar à cozinha", async () => {
    await setManualAcceptance(db, manager, true);
    const r = await order();
    if (!r.ok) throw new Error(r.message);
    await closeTable(db, staff, T1.id, { force: true }); // clientes saíram
    await applyStaffAction(db, staff, r.order.id, "approve", deps); // alguém aprova o pedido antigo
    const after = await getOrderForTable(db, T1.publicToken, r.order.id);
    expect(after?.status).not.toBe("ACCEPTED"); // falha: foi enviado ao POS para uma mesa vazia
  });
});

describe("A4 — reenvio às cegas para um POS sem idempotência duplica o pedido na cozinha", () => {
  it("com timeout ambíguo e POS sem chave idempotente, o pedido não deve ser reenviado", async () => {
    const calls: string[] = [];
    class SlowNonIdempotentPos extends MockPosAdapter {
      override readonly capabilities: PosCapabilities = { ...new MockPosAdapter().capabilities, externalIdempotencyKey: false };
      private first = true;
      override async submitOrder(o: PosOrderRequest): Promise<PosOrderResult> {
        calls.push(o.externalOrderId);
        if (this.first) {
          this.first = false;
          await new Promise((r) => setTimeout(r, 60)); // POS recebe, mas responde depois do timeout
        }
        return { outcome: "accepted", posOrderRef: `X-${calls.length}` };
      }
    }
    const slow = new SlowNonIdempotentPos();
    const d: PlaceOrderDeps = { db, resolvePos: () => slow, backoffMs: () => 0, posTimeoutMs: 20 };
    await order(d);
    await runOutboxOnce(db, d);
    await new Promise((r) => setTimeout(r, 80));
    expect(calls.length).toBe(1); // falha: 2 envios do mesmo pedido
  });
});

describe("A5 — sem webhook/reconciliação, um pagamento aprovado fica 'pendente' se o cliente fechar o browser", () => {
  it("o painel deve ver a mesa paga mesmo sem o telemóvel do cliente voltar a perguntar", async () => {
    await order();
    const p = await startPay();
    provider.complete(p.ref, "mb_way"); // cliente aprovou na app MB WAY e fechou o browser
    // O worker reconcilia os pendentes (ciclo de ~30 s), sem o telemóvel do cliente.
    await reconcilePendingPayments(db, provider, new Date(Date.now() + 30_000));
    const mesa1 = (await listTables(db, staff)).find((t) => t.tableId === T1.id)!;
    expect(mesa1.bill?.dueCents).toBe(0); // falha: painel mostra 2,50 € em falta → staff cobra outra vez
  });
});

describe("A6 — IP do cliente forjável (rate limit contornável)", () => {
  it("atrás da Vercel deve usar o IP da plataforma, não um cabeçalho enviado pelo cliente", () => {
    const h = new Headers({ "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "203.0.113.7" });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.7"); // falha: devolve o valor forjado 6.6.6.6
  });
});

describe("A7 — modo de entrada de desenvolvimento ativo com uma base de dados real", () => {
  it("não deve existir 'dev login' quando DATABASE_URL aponta para uma base real", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres@db.exemplo.supabase.co:5432/postgres");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(authMode()).not.toBe("dev"); // falha: 'dev' → qualquer membro pode ser personificado
  });

  it("com Postgres em localhost (dev) continua a haver entrada de demonstração; em produção não", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:54329/mesa");
    vi.stubEnv("NODE_ENV", "development");
    expect(authMode()).toBe("dev");
    vi.stubEnv("NODE_ENV", "production");
    expect(authMode()).toBe("unavailable");
    vi.stubEnv("MESA_LOCAL_BENCH", "1"); // teste de carga local, base local
    expect(authMode()).toBe("dev");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres@db.exemplo.supabase.co:5432/postgres");
    expect(authMode()).toBe("unavailable"); // nem com MESA_LOCAL_BENCH numa base remota
  });
});

describe("A8 — catálogo pedido ao POS em cada visualização da ementa", () => {
  it("abrir a ementa várias vezes não deve chamar o POS de cada vez", async () => {
    const spy = vi.spyOn(pos, "fetchCatalog");
    const directory = createDbTableDirectory(db, () => pos);
    for (let i = 0; i < 5; i++) await getTableMenu(T1.publicToken, { db, directory });
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1); // falha: 5 chamadas ao POS
  });
});

describe("A9 — pedido pago e conta aberta: bill não bate com o que o POS fatura", () => {
  it("(documental) a conta da app só conhece pedidos feitos pela app", async () => {
    await order();
    const bill = (await getTableBillByToken(db, T1.publicToken))!;
    // Não há forma de juntar à conta o que o empregado lançou diretamente no POS.
    expect(bill.totalCents).toBe(250);
  });
});

describe("S3 — pedidos de valor alto (QR fotografado)", () => {
  it("por omissão não pede confirmação (não quebra o ritmo): segue para a cozinha com a etiqueta 'Valor alto'", async () => {
    const r = await placeOrder(
      { tableToken: T1.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D441", quantity: 2 }] }, // 180 €
      { clientIpHash: randomUUID() },
      deps,
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.order.status).toBe("ACCEPTED");
    const { getBoard } = await import("@/server/staff/staff-service");
    const o = (await getBoard(db, staff)).orders.find((x) => x.id === r.order.id)!;
    expect(o).toMatchObject({ awaitingApproval: false, highValue: true });
  });

  it("com o limite ligado no painel, um pedido acima dele fica à espera do staff e não vai para a cozinha", async () => {
    const { setApprovalThreshold } = await import("@/server/staff/staff-service");
    await setApprovalThreshold(db, manager, 15_000);
    const r = await placeOrder(
      { tableToken: T1.publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D441", quantity: 2 }] }, // 2 × Moët = 180 €
      { clientIpHash: randomUUID() },
      deps,
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.order.status).toBe("RECEIVED");
    expect(() => pos.invoiceOrder(r.order.id)).toThrow(); // não chegou ao POS
    const { getBoard } = await import("@/server/staff/staff-service");
    const o = (await getBoard(db, staff)).orders.find((x) => x.id === r.order.id)!;
    expect(o).toMatchObject({ awaitingApproval: true, approvalReason: expect.stringContaining("150 €") });
    // Abaixo do limite segue diretamente.
    const small = await order();
    expect(small.ok && small.order.status).toBe("ACCEPTED");
  });
});

