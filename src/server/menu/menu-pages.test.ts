import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));
const { jpegsOfImagePdf, prepareMenuPages, sliceTallImage } = await import("./menu-pages");

const jpeg = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#f5efe0" } }).jpeg().toBuffer();
/** PDF mínimo com uma imagem JPEG e sem texto (como as ementas exportadas do Canva). */
const imagePdf = (img: Buffer) =>
  Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /XObject /Subtype /Image /Filter /DCTDecode /Length ${img.length} >>\nstream\n`, "latin1"),
    img,
    Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
  ]);

describe("preparar as páginas da ementa", () => {
  it("tira a imagem de um PDF sem texto e ignora PDFs com texto", async () => {
    const img = await jpeg(400, 600);
    expect(jpegsOfImagePdf(imagePdf(img))?.[0].equals(img)).toBe(true);
    expect(jpegsOfImagePdf(Buffer.from("%PDF-1.4\n<< /Font /F1 >> /DCTDecode stream\nx\nendstream", "latin1"))).toBeNull();
  });

  it("corta uma ementa muito comprida em pedaços legíveis, com sobreposição", async () => {
    const pages = await sliceTallImage({ mediaType: "image/jpeg", data: await jpeg(1000, 14000) });
    expect(pages.length).toBeGreaterThanOrEqual(10);
    expect(pages.length).toBeLessThanOrEqual(12);
    for (const p of pages) {
      const m = await sharp(p.data).metadata();
      expect(m.width).toBe(1000); // até 1200 px mantém a largura
      expect(m.height).toBeLessThanOrEqual(1400);
    }
  });

  it("deixa fotos normais e PDFs com texto como estão", async () => {
    const photo = { mediaType: "image/jpeg" as const, data: await jpeg(800, 1100) };
    const textPdf = { mediaType: "application/pdf" as const, data: Buffer.from("%PDF-1.4\n<< /Font /F1 >>\n%%EOF", "latin1") };
    const out = await prepareMenuPages([photo, textPdf]);
    expect(out).toHaveLength(2);
    expect(out[0].data.equals(photo.data)).toBe(true);
    expect(out[1]).toBe(textPdf);
  });

  it("um PDF de uma imagem comprida passa a vários pedaços JPEG", async () => {
    const out = await prepareMenuPages([{ mediaType: "application/pdf", data: imagePdf(await jpeg(1029, 14399)) }]);
    expect(out.length).toBeGreaterThan(5);
    expect(out.every((p) => p.mediaType === "image/jpeg")).toBe(true);
  });
});
