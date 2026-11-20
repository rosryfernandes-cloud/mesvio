import { describe, expect, it } from "vitest";
import { checkPin, hashPin, nextKind, pairShifts, type ClockEntryRow } from "./clock-service";
import { localMidnight } from "./clock-dates";

const e = (id: string, kind: "in" | "out", at: string, emp = "a"): ClockEntryRow => ({ id, employeeId: emp, employeeName: emp.toUpperCase(), kind, at, hasPhoto: true });

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
    const shifts = pairShifts([
      e("1", "in", "2026-11-20T09:00:00.000Z"),
      e("2", "out", "2026-11-20T13:30:00.000Z"),
      e("3", "out", "2026-11-20T23:00:00.000Z", "b"),
      e("4", "in", "2026-11-20T19:00:00.000Z"),
    ]);
    expect(shifts.find((s) => s.inEntryId === "1")).toMatchObject({ outEntryId: "2", minutes: 270 });
    expect(shifts.find((s) => s.outEntryId === "3")).toMatchObject({ inAt: null, minutes: null });
    expect(shifts.find((s) => s.inEntryId === "4")).toMatchObject({ outAt: null });
  });

  it("calcula a meia-noite local (Lisboa no inverno e no verão)", () => {
    expect(localMidnight("2026-11-20", "Europe/Lisbon").toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(localMidnight("2026-07-15", "Europe/Lisbon").toISOString()).toBe("2026-07-14T23:00:00.000Z");
  });
});
