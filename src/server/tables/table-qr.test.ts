import { describe, expect, it } from "vitest";
import { isLocalOnlyUrl, resolvePublicBaseUrl, tableQrSvg } from "./table-qr";

describe("QR das mesas", () => {
  it("gera um SVG", async () => {
    const svg = await tableQrSvg("https://app.exemplo.pt/m/jG6WQHgwr4fQ5qQEOKtZJw");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<path");
  });

  it("usa NEXT_PUBLIC_APP_URL quando definida, senão o endereço do pedido", () => {
    expect(resolvePublicBaseUrl("https://app.exemplo.pt/", "192.168.1.20:3000", "http")).toBe("https://app.exemplo.pt");
    expect(resolvePublicBaseUrl(undefined, "192.168.1.20:3000", null)).toBe("http://192.168.1.20:3000");
    expect(resolvePublicBaseUrl("  ", "mesa.pt", "https")).toBe("https://mesa.pt");
  });

  it("deteta URLs que um telemóvel não consegue abrir", () => {
    expect(isLocalOnlyUrl("http://localhost:3000")).toBe(true);
    expect(isLocalOnlyUrl("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalOnlyUrl("http://192.168.1.20:3000")).toBe(false);
    expect(isLocalOnlyUrl("https://app.exemplo.pt")).toBe(false);
  });
});
