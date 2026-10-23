import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, totpCode, totpUri, verifyTotp } from "./totp";

// RFC 6238, anexo B (SHA-1, segredo "12345678901234567890"); os 6 últimos dígitos dos códigos de 8.
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("base32 de ida e volta", () => {
    expect(SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(SECRET).toString()).toBe("12345678901234567890");
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
  });

  it("coincide com os vetores de teste oficiais", () => {
    expect(totpCode(SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totpCode(SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpCode(SECRET, Math.floor(1234567890 / 30))).toBe("005924");
    expect(totpCode(SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("aceita ±30 s de desacerto e recusa códigos mais antigos", () => {
    const now = 1234567890_000;
    const step = Math.floor(1234567890 / 30);
    expect(verifyTotp(SECRET, totpCode(SECRET, step), now)).toBe(step);
    expect(verifyTotp(SECRET, totpCode(SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(SECRET, totpCode(SECRET, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(SECRET, totpCode(SECRET, step - 2), now)).toBeNull();
    expect(verifyTotp(SECRET, "12345", now)).toBeNull();
  });

  it("um código já usado não volta a servir", () => {
    const now = 1234567890_000;
    const step = Math.floor(1234567890 / 30);
    expect(verifyTotp(SECRET, totpCode(SECRET, step), now, step)).toBeNull();
  });

  it("gera o URI que as apps leem", () => {
    expect(totpUri("ABC", "ana@mesvio.pt")).toBe(
      "otpauth://totp/MESVIO%3Aana%40mesvio.pt?secret=ABC&issuer=MESVIO&algorithm=SHA1&digits=6&period=30",
    );
  });
});
