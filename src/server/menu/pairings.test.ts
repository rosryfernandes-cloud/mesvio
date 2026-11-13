import { describe, expect, it } from "vitest";
import { computePairings } from "./pairings";

describe("costuma acompanhar", () => {
  it("sugere os artigos mais pedidos em conjunto, a partir de um mínimo de vezes", () => {
    const orders = [
      ["bitoque", "imperial"],
      ["bitoque", "imperial", "agua"],
      ["bitoque", "imperial", "imperial"],
      ["bitoque", "agua"],
      ["polvo", "vinho"],
    ];
    const p = computePairings(orders, 2);
    expect(p.bitoque).toEqual(["imperial", "agua"]);
    expect(p.imperial).toEqual(["bitoque"]);
    expect(p.polvo).toBeUndefined();
  });

  it("sem histórico suficiente, não sugere nada", () => {
    expect(computePairings([["a", "b"]])).toEqual({});
  });
});
