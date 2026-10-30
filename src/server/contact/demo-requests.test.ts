import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { demoRequests } from "@/server/db/schema";
import {
  countOpenDemoRequests,
  createDemoRequest,
  DEMO_REQUEST_LIMIT,
  listDemoRequests,
  pruneDemoRequests,
  retryDemoRequestEmails,
  sendDemoConfirmationEmail,
  sendDemoRequestEmail,
  updateDemoRequest,
} from "./demo-requests";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

const valid = { name: "Joana Silva", business: "Bar da Praia Azul", email: "Joana@Exemplo.pt", venueType: "Bar de praia", message: "20 espreguiçadeiras" };

describe("pedidos de demonstração da landing", () => {
  it("guarda o pedido e avisa a equipa", async () => {
    const notify = vi.fn(async () => true);
    expect(await createDemoRequest(db, valid, { ipHash: "ip1", notify })).toEqual({ ok: true, notified: true });
    const [row] = await db.select().from(demoRequests);
    expect(row).toMatchObject({ name: "Joana Silva", business: "Bar da Praia Azul", email: "joana@exemplo.pt", venueType: "Bar de praia" });
    expect(row.notifiedAt).not.toBeNull();
    expect(notify).toHaveBeenCalledOnce();
  });

  it("se o email falhar, o pedido fica guardado por avisar", async () => {
    const r = await createDemoRequest(db, valid, { ipHash: "ip1", notify: async () => { throw new Error("rede"); } });
    expect(r).toEqual({ ok: true, notified: false });
    const [row] = await db.select().from(demoRequests);
    expect(row.notifiedAt).toBeNull();
  });

  it("recusa dados inválidos com uma mensagem clara", async () => {
    const r = await createDemoRequest(db, { ...valid, email: "nao-e-email" }, { ipHash: "ip1", notify: async () => true });
    expect(r).toMatchObject({ ok: false, code: "INVALID_INPUT", message: "Indica um email válido." });
    expect(await db.$count(demoRequests)).toBe(0);
  });

  it("um robô que preenche o campo escondido não fica guardado", async () => {
    const notify = vi.fn(async () => true);
    expect(await createDemoRequest(db, { ...valid, website: "http://spam" }, { ipHash: "ip1", notify })).toEqual({ ok: true, notified: false });
    expect(await db.$count(demoRequests)).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("limita pedidos seguidos do mesmo IP", async () => {
    const notify = async () => false;
    for (let i = 0; i < DEMO_REQUEST_LIMIT.limit; i++) expect((await createDemoRequest(db, valid, { ipHash: "ip1", notify })).ok).toBe(true);
    expect(await createDemoRequest(db, valid, { ipHash: "ip1", notify })).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect((await createDemoRequest(db, valid, { ipHash: "ip2", notify })).ok).toBe(true);
  });

  it("sem Resend configurado não tenta enviar email", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const [row] = await db.insert(demoRequests).values({ name: "A", business: "B", email: "a@b.pt" }).returning();
    expect(await sendDemoRequestEmail(row)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    fetchSpy.mockRestore();
  });
});

describe("conservação dos pedidos de demonstração", () => {
  it("apaga os pedidos com mais de 12 meses e mantém os recentes", async () => {
    const now = new Date("2027-10-23T12:00:00Z");
    await db.insert(demoRequests).values([
      { name: "Antigo", business: "A", email: "a@a.pt", createdAt: new Date("2026-10-01T00:00:00Z") },
      { name: "Recente", business: "B", email: "b@b.pt", createdAt: new Date("2027-06-01T00:00:00Z") },
    ]);
    await pruneDemoRequests(db, now);
    expect((await db.select().from(demoRequests)).map((r) => r.name)).toEqual(["Recente"]);
  });
});

describe("pedidos de demonstração por avisar", () => {
  it("volta a tentar o email dos pedidos que ficaram por avisar", async () => {
    const db = await createTestDb();
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("DEMO_REQUESTS_TO", "eu@exemplo.pt");
    vi.stubEnv("DEMO_REQUESTS_FROM", "MESVIO <nao-responder@exemplo.pt>");
    await db.insert(demoRequests).values({ name: "Ana", business: "Bar", email: "ana@exemplo.pt", ipHash: "x" });
    const seen: string[] = [];
    const confirmed: string[] = [];
    const confirm = async (r: { email: string }) => (confirmed.push(r.email), true);
    expect(await retryDemoRequestEmails(db, { notify: async (r) => (seen.push(r.business), true), confirm })).toBe(2);
    expect(seen).toEqual(["Bar"]);
    expect(confirmed).toEqual(["ana@exemplo.pt"]);
    // Já avisado e confirmado: não repete.
    expect(await retryDemoRequestEmails(db, { notify: async () => true, confirm })).toBe(0);
    vi.unstubAllEnvs();
  });
});

describe("resposta automática e seguimento", () => {
  it("a pessoa recebe o email de confirmação (respostas vão para a equipa) e a equipa é avisada no telemóvel", async () => {
    const confirm = vi.fn(async () => true);
    const alert = vi.fn();
    await createDemoRequest(db, valid, { ipHash: "ip1", notify: async () => true, confirm, alert });
    const [row] = await db.select().from(demoRequests);
    expect(row.confirmationSentAt).not.toBeNull();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ email: "joana@exemplo.pt" }));
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ business: "Bar da Praia Azul" }));
  });

  it("o email de confirmação vai para a pessoa, responde para a equipa e não deixa passar HTML", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("DEMO_REQUESTS_TO", "eu@exemplo.pt");
    vi.stubEnv("DEMO_REQUESTS_FROM", "MESVIO <nao-responder@exemplo.pt>");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const [row] = await db.insert(demoRequests).values({ name: "Rui <b>Costa</b>", business: "Bar <script>", email: "rui@exemplo.pt" }).returning();
    expect(await sendDemoConfirmationEmail(row)).toBe(true);
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ to: ["rui@exemplo.pt"], reply_to: ["eu@exemplo.pt"] });
    expect(body.html).not.toContain("<script>");
    expect(body.html).toContain("Bar &lt;script&gt;");
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("no painel central: estado e notas de cada pedido, e quantos estão por tratar", async () => {
    await createDemoRequest(db, valid, { ipHash: "ip1", notify: async () => true, confirm: async () => true, alert: () => {} });
    await createDemoRequest(db, { ...valid, business: "Hotel Mar" }, { ipHash: "ip2", notify: async () => true, confirm: async () => true, alert: () => {} });
    expect(await countOpenDemoRequests(db)).toBe(2);
    const [a, b] = await listDemoRequests(db);
    expect(await updateDemoRequest(db, a.id, { status: "client", notes: "Assinou plano 3" })).toBe(true);
    expect(await updateDemoRequest(db, b.id, { status: "contacted" })).toBe(true);
    expect(await updateDemoRequest(db, b.id, { status: "inventado" })).toBe(false);
    expect(await countOpenDemoRequests(db)).toBe(1);
    const after = await listDemoRequests(db);
    expect(after.find((r) => r.id === a.id)).toMatchObject({ status: "client", notes: "Assinou plano 3" });
    expect(after.find((r) => r.id === a.id)!.statusChangedAt).not.toBeNull();
  });
});

