import { describe, expect, it } from "vitest";
import { AA, brandPalette, contrast, normalizeHex } from "./brand-color";

describe("cor própria do restaurante", () => {
  it("normaliza #abc, abc e maiúsculas", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("1d3557")).toBe("#1d3557");
    expect(normalizeHex("azul")).toBeNull();
  });

  it("aceita cores escuras e o tom suave mantém o texto legível", () => {
    for (const c of ["#062d25", "#1d3557", "#7c2d12", "#9f1239", "#000000"]) {
      const r = brandPalette(c);
      expect(r.ok, c).toBe(true);
      if (!r.ok) continue;
      expect(contrast(r.palette.brand, "#ffffff")).toBeGreaterThanOrEqual(AA);
      expect(contrast(r.palette.brand, r.palette.brandSoft)).toBeGreaterThanOrEqual(AA);
      expect(contrast("#4b5b56", r.palette.brandSoft)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("recusa cores claras em que o texto branco não se lê", () => {
    for (const c of ["#91e9c3", "#ffcc00", "#ff7f50", "#ffffff"]) expect(brandPalette(c).ok, c).toBe(false);
  });
});
