import { describe, expect, it } from "vitest";
import { maxTipCents, parseTipEuros } from "./tip";

describe("gorjeta em euros", () => {
  it("lê o valor escrito com vírgula ou ponto", () => {
    expect(parseTipEuros("2,5")).toBe(250);
    expect(parseTipEuros("3.75")).toBe(375);
    expect(parseTipEuros("")).toBe(0);
    expect(parseTipEuros("abc")).toBeNull();
    expect(parseTipEuros("1,234")).toBeNull();
  });
  it("máximo: metade da conta ou 10 €, até 100 €", () => {
    expect(maxTipCents(500)).toBe(1000);
    expect(maxTipCents(6000)).toBe(3000);
    expect(maxTipCents(100000)).toBe(10000);
  });
});
