import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { demoRequests } from "@/server/db/schema";
import { createDemoRequest, DEMO_REQUEST_LIMIT, sendDemoRequestEmail } from "./demo-requests";

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
