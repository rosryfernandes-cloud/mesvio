import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPublicUrl, isPrivateAddress, safeFetch } from "./safe-fetch";

const publicDns = async () => ["93.184.216.34"];

describe("links dados pelos utilizadores (SSRF)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reconhece endereços internos", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("só aceita http(s) público nas portas normais", async () => {
    expect(await checkPublicUrl("https://restaurante.pt/menu", publicDns)).not.toBeNull();
    expect(await checkPublicUrl("file:///etc/passwd", publicDns)).toBeNull();
    expect(await checkPublicUrl("http://localhost/", publicDns)).toBeNull();
    expect(await checkPublicUrl("http://169.254.169.254/latest/meta-data", publicDns)).toBeNull();
    expect(await checkPublicUrl("https://restaurante.pt:8080/", publicDns)).toBeNull();
    expect(await checkPublicUrl("https://user:pass@restaurante.pt/", publicDns)).toBeNull();
    expect(await checkPublicUrl("https://interno.exemplo.pt/", async () => ["10.0.0.5"])).toBeNull();
    expect(await checkPublicUrl("https://misto.exemplo.pt/", async () => ["93.184.216.34", "127.0.0.1"])).toBeNull();
  });

  it("verifica cada redirecionamento e corta respostas grandes", async () => {
    const fetchMock = vi.fn(async (url: URL) =>
      url.hostname === "restaurante.pt"
        ? new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } })
        : new Response("x".repeat(100), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await safeFetch("https://restaurante.pt/menu", { maxBytes: 1000, resolve: publicDns })).toEqual({ ok: false, reason: "BLOCKED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await safeFetch("https://outro.pt/", { maxBytes: 10, resolve: publicDns })).toEqual({ ok: false, reason: "TOO_LARGE" });
    const ok = await safeFetch("https://outro.pt/", { maxBytes: 1000, resolve: publicDns });
    expect(ok.ok && ok.bytes.length).toBe(100);
  });
});
