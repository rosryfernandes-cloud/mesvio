import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { MockPosAdapter } from "@/server/pos/mock/mock-pos-adapter";
import { placeOrder } from "@/server/orders/place-order";
import { resolveStaffContext, type StaffContext } from "./context";
import { getWeeklySummaryEmail, inSendWindow, renderWeeklyEmail, sendWeeklySummaries, setWeeklySummaryEmail, type EmailSender } from "./weekly-email";

let db: Db;
let owner: StaffContext;
beforeEach(async () => {
  db = await createTestDb();
  owner = (await resolveStaffContext(db, DEMO_USERS[0].userId))!;
});

// Segunda-feira, 16 de novembro de 2026, 9h em Lisboa (inverno: UTC+0).
const MONDAY_9H = new Date("2026-11-16T09:00:00Z");

describe("resumo semanal por email", () => {
  it("só envia às segundas de manhã, em Lisboa", () => {
    expect(inSendWindow(MONDAY_9H)).toBe(true);
    expect(inSendWindow(new Date("2026-11-16T07:30:00Z"))).toBe(false);
    expect(inSendWindow(new Date("2026-11-17T09:00:00Z"))).toBe(false);
  });

  it("desligado por defeito; o dono liga no painel; envia uma vez por semana aos donos", async () => {
    expect(await getWeeklySummaryEmail(db, owner)).toBe(false);
    const sent: { to: string[]; subject: string }[] = [];
    const send: EmailSender = async (m) => {
      sent.push(m);
      return true;
    };
    expect(await sendWeeklySummaries(db, MONDAY_9H, send)).toBe(0);

    await setWeeklySummaryEmail(db, owner, true);
    expect(await getWeeklySummaryEmail(db, owner)).toBe(true);
    const r = await placeOrder(
      { tableToken: DEMO_TABLES[0].publicToken, idempotencyKey: randomUUID(), lines: [{ productRef: "D361", quantity: 2 }] },
      { clientIpHash: "ip" },
      { db, resolvePos: () => new MockPosAdapter(), backoffMs: () => 0, maxAttempts: 1 },
    );
    expect(r.ok).toBe(true);
    // O pedido de teste tem a data de hoje: o envio é na segunda-feira seguinte.
    const now = new Date();
    const nextMonday = new Date(now.getTime() + ((8 - now.getUTCDay()) % 7 || 7) * 86400000);
    nextMonday.setUTCHours(9, 0, 0, 0);
    expect(await sendWeeklySummaries(db, nextMonday, send)).toBe(1);
    expect(sent[0].to).toContain(DEMO_USERS[0].email);
    // Repetir na mesma manhã não volta a enviar.
    expect(await sendWeeklySummaries(db, new Date(nextMonday.getTime() + 60_000), send)).toBe(0);
  });

  it("o email mostra os números e como deixar de o receber", () => {
    const m = renderWeeklyEmail(
      "Casa <Teste>",
      {
        orders: 12,
        salesCents: 34500,
        averageTicketCents: 2875,
        previous: { orders: 10, salesCents: 30000 },
        byDay: [{ date: "2026-11-14", orders: 12, salesCents: 34500 }],
        byHour: [{ hour: 13, orders: 7 }],
        topProducts: [{ name: "Bitoque", quantity: 5 }],
        notOrdered: [],
        soldOutOften: [{ name: "Polvo", times: 3 }],
      },
      "https://mesvio.pt",
    );
    expect(m.subject).toBe("Casa <Teste>: a sua semana na MESVIO");
    expect(m.html).toContain("Casa &lt;Teste&gt;");
    expect(m.text).toContain("Pedidos: 12 (+20% que na semana anterior)");
    expect(m.text).toContain("Melhor dia: sábado");
    expect(m.text).toContain("Esgotou várias vezes: Polvo");
    expect(m.text).toContain("desligue-o no separador Resumo");
  });
});
