import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AuthenticationResponseJSON, RegistrationResponseJSON, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { createTestDb, type Db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { DEMO_PLATFORM_ADMIN } from "@/server/db/seed-demo";
import { checkActivation, findPlatformAdmin, type PlatformAdmin } from "./admin-auth";
import { ACTIVATION_TTL_MS, generateActivationCode, hashActivationCode } from "./activation";
import {
  deviceName,
  finishPasskeyAuthentication,
  finishPasskeyRegistration,
  getSecurityOverview,
  passkeyRegistrationOptions,
  RECOVERY_CODE_COUNT,
  regenerateRecoveryCodes,
  redeemRecoveryCode,
  removePasskey,
} from "./passkeys";

let db: Db;
let admin: PlatformAdmin;
const rp = { origin: "https://mesvio.example", rpID: "mesvio.example" };

beforeEach(async () => {
  db = await createTestDb();
  admin = (await findPlatformAdmin(db, DEMO_PLATFORM_ADMIN.userId))!;
});

// A criptografia do WebAuthn é da biblioteca; aqui testa-se o que a MESVIO faz com o resultado.
const regOk = (id: string) =>
  (async () => ({
    verified: true,
    registrationInfo: { credential: { id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal", "hybrid"] } },
  })) as unknown as typeof verifyRegistrationResponse;
const regFail = (async () => ({ verified: false })) as unknown as typeof verifyRegistrationResponse;
const authResult = (verified: boolean, seen: unknown[] = []) =>
  (async (opts: unknown) => {
    seen.push(opts);
    return { verified, authenticationInfo: { newCounter: 0 } };
  }) as unknown as typeof verifyAuthenticationResponse;

const regResponse = (id: string) => ({ id }) as unknown as RegistrationResponseJSON;
const authResponse = (id: string) => ({ id }) as unknown as AuthenticationResponseJSON;

async function addKey(id = "cred-1", name = "iPhone") {
  return finishPasskeyRegistration(db, admin, { response: regResponse(id), challenge: "c", rp, name }, regOk(id));
}

describe("Face ID / Touch ID no painel central", () => {
  it("a primeira chave ativa a verificação, gasta o código de ativação e dá 10 códigos de recuperação", async () => {
    const code = generateActivationCode();
    await db
      .update(t.platformAdmins)
      .set({ enrollmentCodeHash: hashActivationCode(code), enrollmentCodeExpiresAt: new Date(Date.now() + ACTIVATION_TTL_MS) })
      .where(eq(t.platformAdmins.userId, admin.userId));
    expect(await checkActivation(db, admin, "AAAA-BBBB-CCCC", { requireActivation: true })).toMatchObject({ code: "ACTIVATION_INVALID" });
    expect(await checkActivation(db, admin, code, { requireActivation: true })).toBeNull();

    const options = await passkeyRegistrationOptions(db, admin, rp);
    expect(options.rp).toMatchObject({ id: "mesvio.example" });
    expect(options.authenticatorSelection?.userVerification).toBe("required");

    const r = await addKey();
    expect(r).toMatchObject({ ok: true });
    expect((r as { recoveryCodes: string[] }).recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
    // O código de ativação deixa de servir.
    expect(await checkActivation(db, admin, code, { requireActivation: true })).toMatchObject({ code: "ACTIVATION_INVALID" });
    // Um segundo aparelho não gera códigos novos.
    expect(await addKey("cred-2", "Mac")).toEqual({ ok: true, recoveryCodes: undefined });
    expect((await getSecurityOverview(db, admin)).passkeys.map((k) => k.name)).toEqual(["iPhone", "Mac"]);
  });

  it("recusa registos que a biblioteca não confirma e a mesma chave duas vezes", async () => {
    expect(await finishPasskeyRegistration(db, admin, { response: regResponse("x"), challenge: "c", rp, name: "iPhone" }, regFail)).toMatchObject({ ok: false });
    await addKey("dup");
    expect(await addKey("dup")).toMatchObject({ ok: false, message: "Esta chave já está registada." });
  });

  it("entrar: a chave tem de ser desta pessoa e a assinatura tem de bater certo", async () => {
    await addKey("cred-1");
    const seen: unknown[] = [];
    expect(await finishPasskeyAuthentication(db, admin, { response: authResponse("cred-1"), challenge: "ch", rp }, authResult(true, seen))).toEqual({ ok: true });
    expect(seen[0]).toMatchObject({ expectedChallenge: "ch", expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: true });
    expect((await getSecurityOverview(db, admin)).passkeys[0].lastUsedAt).not.toBeNull();

    expect(await finishPasskeyAuthentication(db, admin, { response: authResponse("cred-1"), challenge: "ch", rp }, authResult(false))).toMatchObject({ ok: false });
    // Chave desconhecida (ou de outro administrador): nem chega a verificar.
    expect(await finishPasskeyAuthentication(db, admin, { response: authResponse("outra"), challenge: "ch", rp }, authResult(true))).toMatchObject({ ok: false });
  });

  it("não deixa apagar a última forma de entrar", async () => {
    await addKey("a");
    const [k] = (await getSecurityOverview(db, admin)).passkeys;
    expect(await removePasskey(db, admin, k.id)).toMatchObject({ ok: false });
    await addKey("b", "Mac");
    expect(await removePasskey(db, admin, k.id)).toEqual({ ok: true });
    expect((await getSecurityOverview(db, admin)).passkeys.map((x) => x.name)).toEqual(["Mac"]);
  });

  it("dá nome ao aparelho pelo navegador", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("Mac");
    expect(deviceName(null)).toBe("Chave de acesso");
  });
});

describe("códigos de recuperação", () => {
  it("cada código serve uma vez; gerar novos apaga os antigos", async () => {
    const codes = await regenerateRecoveryCodes(db, admin);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    expect(codes[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    // Minúsculas e sem hífen também servem.
    expect(await redeemRecoveryCode(db, admin, codes[0].toLowerCase().replace("-", ""))).toEqual({ ok: true, remaining: 9 });
    expect(await redeemRecoveryCode(db, admin, codes[0])).toMatchObject({ ok: false, code: "INVALID" });
    const rows = await db.select().from(t.platformRecoveryCodes);
    expect(rows.every((r) => !codes.some((c) => r.codeHash.includes(c)))).toBe(true);

    const fresh = await regenerateRecoveryCodes(db, admin);
    expect(await redeemRecoveryCode(db, admin, codes[1])).toMatchObject({ ok: false });
    expect(await redeemRecoveryCode(db, admin, fresh[0])).toEqual({ ok: true, remaining: 9 });
  });

  it("tentativas a mais ficam bloqueadas", async () => {
    const codes = await regenerateRecoveryCodes(db, admin);
    for (let i = 0; i < 5; i++) await redeemRecoveryCode(db, admin, "ZZZZ-ZZZZ");
    expect(await redeemRecoveryCode(db, admin, codes[0])).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });
});
