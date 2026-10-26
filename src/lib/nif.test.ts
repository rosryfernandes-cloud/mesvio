import { describe, expect, it } from "vitest";
import { isValidNif } from "./nif";

describe("isValidNif", () => {
  it("aceita NIF com o dígito de controlo certo", () => {
    expect(isValidNif("123456789")).toBe(true);
    expect(isValidNif("509999999")).toBe(true);
    expect(isValidNif("999999990")).toBe(true);
  });
  it("recusa dígito de controlo errado, tamanho errado e tipos que não existem", () => {
    expect(isValidNif("123456780")).toBe(false);
    expect(isValidNif("12345678")).toBe(false);
    expect(isValidNif("12345678a")).toBe(false);
    expect(isValidNif("412345678")).toBe(false);
  });
});
