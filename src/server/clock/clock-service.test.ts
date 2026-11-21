import { describe, expect, it } from "vitest";
import { checkPin, hashPin, nextKind, pairShifts, type ClockEntryRow } from "./clock-service";
import { localMidnight } from "./clock-dates";

const e = (id: string, kind: ClockEntryRow["kind"], at: string, emp = "a"): ClockEntryRow => ({ id, employeeId: emp, employeeName: emp.toUpperCase(), kind, at, hasPhoto: true, source: "tablet", originalAt: null });

describe("picar ponto", () => {
  it("guarda o PIN com sal e só aceita o certo", () => {
    const h = hashPin("1234");
    expect(h).not.toContain("1234");
    expect(hashPin("1234")).not.toBe(h);
    expect(checkPin("1234", h)).toBe(true);
    expect(checkPin("4321", h)).toBe(false);
  });

  it("a seguir a uma entrada recente vem a saída; uma entrada esquecida há muito volta a ser entrada", () => {
    const now = new Date("2026-11-20T18:00:00Z");
    expect(nextKind(undefined, now)).toBe("in");
    expect(nextKind({ kind: "in", at: new Date("2026-11-20T09:00:00Z") }, now)).toBe("out");
    expect(nextKind({ kind: "out", at: new Date("2026-11-20T17:00:00Z") }, now)).toBe("in");
    expect(nextKind({ kind: "in", at: new Date("2026-11-19T09:00:00Z") }, now)).toBe("in");
  });

  it("junta entradas e saídas em turnos com as horas, e assinala o que falta", () => {
    const now = new Date("2026-11-20T20:00:00.000Z");
    const shifts = pairShifts(
      [
        e("1", "in", "2026-11-20T09:00:00.000Z"),
        e("2", "out", "2026-11-20T13:30:00.000Z"),
        e("3", "out", "2026-11-20T23:00:00.000Z", "b"),
        e("4", "in", "2026-11-20T19:00:00.000Z"),
      ],
      now,
    );
    expect(shifts.find((s) => s.inEntryId === "1")).toMatchObject({ outEntryId: "2", minutes: 270, status: "closed" });
    expect(shifts.find((s) => s.outEntryId === "3")).toMatchObject({ inAt: null, minutes: null, status: "noIn" });
    expect(shifts.find((s) => s.inEntryId === "4")).toMatchObject({ outAt: null, status: "open" });
  });

  it("desconta as pausas e assinala a saída esquecida", () => {
    const shifts = pairShifts(
      [
        e("1", "in", "2026-11-18T09:00:00.000Z"),
        e("2", "pause", "2026-11-18T13:00:00.000Z"),
        e("3", "resume", "2026-11-18T13:45:00.000Z"),
        e("4", "out", "2026-11-18T18:00:00.000Z"),
        e("5", "in", "2026-11-19T09:00:00.000Z"),
      ],
      new Date("2026-11-20T12:00:00.000Z"),
    );
    expect(shifts.find((s) => s.inEntryId === "1")).toMatchObject({ minutes: 9 * 60 - 45, pauseMinutes: 45, status: "closed" });
    expect(shifts.find((s) => s.inEntryId === "5")).toMatchObject({ status: "forgot", minutes: null });
  });

  it("só deixa fazer o que faz sentido no estado (pausa só a trabalhar, regresso só em pausa)", async () => {
    const { stateFrom, ALLOWED } = await import("./clock-service");
    const now = new Date("2026-11-20T12:00:00Z");
    const recent = new Date("2026-11-20T11:00:00Z");
    expect(ALLOWED[stateFrom(undefined, now)]).toEqual(["in"]);
    expect(ALLOWED[stateFrom({ kind: "in", at: recent }, now)]).toEqual(["pause", "out"]);
    expect(ALLOWED[stateFrom({ kind: "pause", at: recent }, now)]).toEqual(["resume", "out"]);
    expect(ALLOWED[stateFrom({ kind: "resume", at: recent }, now)]).toEqual(["pause", "out"]);
  });

  it("calcula a meia-noite local (Lisboa no inverno e no verão)", () => {
    expect(localMidnight("2026-11-20", "Europe/Lisbon").toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(localMidnight("2026-07-15", "Europe/Lisbon").toISOString()).toBe("2026-07-14T23:00:00.000Z");
  });
});

describe("reconhecimento facial", () => {
  const vec = (seed: number) => Array.from({ length: 128 }, (_, i) => Math.sin(seed * 31 + i) * 0.1);
  const near = (v: number[], d: number) => v.map((x, i) => x + (i === 0 ? d : 0));

  it("reconhece a pessoa certa quando a cara está perto, e ninguém quando está longe", async () => {
    const { bestFaceMatch } = await import("./clock-service");
    const ana = vec(1), rui = vec(2);
    const people = [{ id: "ana", samples: [ana] }, { id: "rui", samples: [rui] }];
    expect(bestFaceMatch(near(ana, 0.2), people)?.id).toBe("ana");
    expect(bestFaceMatch(vec(9).map((x) => x * 8), people)).toBeNull();
  });

  it("não decide quando duas pessoas são quase iguais (gémeos)", async () => {
    const { bestFaceMatch } = await import("./clock-service");
    const a = vec(3);
    expect(bestFaceMatch(a, [{ id: "a", samples: [near(a, 0.1)] }, { id: "b", samples: [near(a, 0.12)] }])).toBeNull();
  });
});
