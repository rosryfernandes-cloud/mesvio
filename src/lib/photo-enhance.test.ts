import { describe, expect, it } from "vitest";
import { enhancePixels } from "./photo-enhance";

const image = (pixels: [number, number, number][]) => new Uint8ClampedArray(pixels.flatMap(([r, g, b]) => [r, g, b, 255]));
const luminance = (d: Uint8ClampedArray) => {
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return s / (d.length / 4);
};

describe("melhorar fotos dos pratos", () => {
  it("uma foto escura e baça fica mais clara e com mais contraste", () => {
    const dark = image(Array.from({ length: 1000 }, (_, i) => [40 + (i % 60), 35 + (i % 60), 30 + (i % 60)]));
    const before = luminance(dark);
    const spreadBefore = dark[4 * 59] - dark[0];
    enhancePixels(dark);
    expect(luminance(dark)).toBeGreaterThan(before + 20);
    expect(dark[4 * 59] - dark[0]).toBeGreaterThan(spreadBefore);
  });

  it("uma foto já boa quase não muda", () => {
    const good = image(Array.from({ length: 1000 }, (_, i) => [(i * 7) % 256, (i * 5) % 256, (i * 3) % 256]));
    const before = luminance(good);
    enhancePixels(good);
    expect(Math.abs(luminance(good) - before)).toBeLessThan(8);
  });

  it("não mexe na transparência e aceita uma imagem vazia", () => {
    const px = new Uint8ClampedArray([10, 20, 30, 128]);
    expect(enhancePixels(px)[3]).toBe(128);
    expect(enhancePixels(new Uint8ClampedArray())).toHaveLength(0);
  });
});
