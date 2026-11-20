import { describe, expect, it } from "vitest";
import { cleanSections, localNow } from "./daily-menu";

describe("menu do dia", () => {
  it("usa a data, o dia da semana e a hora do fuso do restaurante", () => {
    // 23:30 em Lisboa a 20/11/2026 (sexta) já é sábado 21 noutro fuso.
    const now = new Date("2026-11-20T23:30:00Z");
    expect(localNow("Europe/Lisbon", now)).toEqual({ date: "2026-11-20", weekday: 5, time: "23:30" });
    expect(localNow("Asia/Tokyo", now)).toMatchObject({ date: "2026-11-21", weekday: 6 });
  });

  it("tira pratos e secções vazios que o editor deixa", () => {
    expect(
      cleanSections([
        { title: " Sopa do dia ", items: [{ name: " Caldo verde ", halfPriceCents: null, priceCents: 180 }, { name: "  ", halfPriceCents: null, priceCents: null }] },
        { title: "Vazia", items: [{ name: "", halfPriceCents: null, priceCents: null }] },
      ]),
    ).toEqual([{ title: "Sopa do dia", items: [{ name: "Caldo verde", halfPriceCents: null, priceCents: 180 }] }]);
  });
});
