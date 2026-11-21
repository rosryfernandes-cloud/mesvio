import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { DEMO_ESTABLISHMENT, DEMO_ORGANIZATION } from "@/server/pos/mock/demo-data";
import { DEMO_USERS } from "@/server/db/seed-demo";
import { addEmployee, addManualEntry, deleteEntry, editEntryTime, kioskToken, kioskView, listCorrections, listEntries, pairShifts, punch } from "./clock-service";

const s = { userId: DEMO_USERS[0].userId, organizationId: DEMO_ORGANIZATION.id, establishmentId: DEMO_ESTABLISHMENT.id };
const at = (h: string) => new Date(`2026-11-20T${h}:00.000Z`);

describe("picar ponto: pausas e correções (base de dados)", () => {
  let db: Db;
  let token: string;
  let maria: string;
  beforeEach(async () => {
    db = await createTestDb();
    token = await kioskToken(db, s);
    maria = (await addEmployee(db, s, "Maria", "1234")).id;
  });

  it("entrada, pausa, regresso e saída descontam a pausa; uma pausa sem estar a trabalhar é recusada", async () => {
    expect(await punch(db, token, maria, "1234", null, "pause", at("08:59"))).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
    expect(await punch(db, token, maria, "1234", null, undefined, at("09:00"))).toMatchObject({ ok: true, kind: "in" });
    expect((await kioskView(db, token, at("10:00")))!.employees[0]).toMatchObject({ state: "working", next: "out" });
    expect(await punch(db, token, maria, "1234", null, "pause", at("13:00"))).toMatchObject({ ok: true, kind: "pause" });
    expect((await kioskView(db, token, at("13:10")))!.employees[0]).toMatchObject({ state: "paused", next: "resume" });
    expect(await punch(db, token, maria, "1234", null, undefined, at("13:30"))).toMatchObject({ ok: true, kind: "resume" });
    expect(await punch(db, token, maria, "1234", null, "out", at("18:00"))).toMatchObject({ ok: true, kind: "out" });
    const [shift] = pairShifts(await listEntries(db, s, at("00:00"), at("23:59")), at("19:00"));
    expect(shift).toMatchObject({ status: "closed", pauseMinutes: 30, minutes: 9 * 60 - 30, corrected: false });
  });

  it("o dono acrescenta a saída esquecida, corrige uma hora e apaga um engano, e fica tudo no histórico", async () => {
    await punch(db, token, maria, "1234", null, undefined, at("09:00"));
    const add = await addManualEntry(db, s, maria, "out", at("17:00"));
    expect(add).not.toBeNull();
    const entries = await listEntries(db, s, at("00:00"), at("23:59"));
    const entrada = entries.find((e) => e.kind === "in")!;
    expect(await editEntryTime(db, s, entrada.id, at("09:15"))).toBe(true);
    const [shift] = pairShifts(await listEntries(db, s, at("00:00"), at("23:59")), at("19:00"));
    expect(shift).toMatchObject({ status: "closed", minutes: 7 * 60 + 45, corrected: true });
    expect(shift.entries.find((e) => e.kind === "in")!.originalAt).toBe(at("09:00").toISOString());
    expect(await deleteEntry(db, s, add!.id)).toBe(true);
    expect(pairShifts(await listEntries(db, s, at("00:00"), at("23:59")), at("23:00"))[0].status).toBe("open");
    const hist = await listCorrections(db, s, "Europe/Lisbon");
    expect(hist.map((h) => h.action).sort()).toEqual(["add", "delete", "edit"]);
    expect(hist.find((h) => h.action === "edit")!.text).toContain("Maria");
  });
});

describe("picar ponto: escalas, atrasos e avisos ao dono", () => {
  it("compara a escala com as entradas e avisa uma só vez de quem não picou", async () => {
    const { saveWeek, getWeek, attendance, checkScheduleAlerts } = await import("./clock-schedule");
    const t = await import("@/server/db/schema");
    const db = await createTestDb();
    const token = await kioskToken(db, s);
    const maria = (await addEmployee(db, s, "Maria", "1234")).id;
    const joao = (await addEmployee(db, s, "João", "9999")).id;
    // Semana de 16/11 (segunda). Sexta 20/11: Maria 09:00-15:00, João 10:00-16:00 (hora de Lisboa = UTC no inverno).
    await saveWeek(db, s, "2026-11-16", [
      { employeeId: maria, date: "2026-11-20", slots: [{ start: "09:00", end: "15:00" }] },
      { employeeId: joao, date: "2026-11-20", slots: [{ start: "10:00", end: "16:00" }] },
    ]);
    expect((await getWeek(db, s, "2026-11-16")).length).toBe(2);
    await punch(db, token, maria, "1234", null, undefined, at("09:12"));
    const now = at("11:00");
    const shifts = pairShifts(await listEntries(db, s, at("00:00"), at("23:59")), now);
    const att = attendance(await getWeek(db, s, "2026-11-16"), shifts, new Map([[maria, "Maria"], [joao, "João"]]), "Europe/Lisbon", now);
    expect(att.find((a) => a.employeeId === maria)).toMatchObject({ status: "late", lateMinutes: 12 });
    expect(att.find((a) => a.employeeId === joao)).toMatchObject({ status: "absent" });

    // Aviso ao dono: o dono demo com um aparelho registado neste restaurante.
    await db.insert(t.pushSubscriptions).values({ organizationId: s.organizationId, establishmentId: s.establishmentId, userId: s.userId, endpoint: "https://push.example/1", p256dh: "x".repeat(20), auth: "y".repeat(12) });
    const sentBodies: string[] = [];
    const send = async (_sub: unknown, payload: string) => {
      sentBodies.push(JSON.parse(payload).body);
      return { statusCode: 201 };
    };
    expect(await checkScheduleAlerts(db, now, send)).toBe(1);
    expect(sentBodies[0]).toContain("João ainda não picou a entrada");
    expect(await checkScheduleAlerts(db, at("11:05"), send)).toBe(0); // não repete
    // Maria não picou a saída: 45 min depois do fim (15:00) avisa.
    expect(await checkScheduleAlerts(db, at("15:50"), send)).toBe(1);
    expect(sentBodies[1]).toContain("Maria ainda não picou a saída");
  });
});
