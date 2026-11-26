import { describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/server/db/client";
import { DEMO_PLATFORM_ADMIN } from "@/server/db/seed-demo";

vi.mock("server-only", () => ({}));
const { notifyPlatformAdmins, notifyPlatformTest, removePlatformSubscription, savePlatformSubscription } = await import("./push");

const sub = (n: number) => ({ endpoint: `https://push.example.com/aparelho-${n}`, keys: { p256dh: "p256dh-chave", auth: "auth-chave" } });

describe("avisos da Central no telemóvel", () => {
  it("o aparelho ligado na Central recebe os avisos da equipa, uma vez só, e os aparelhos que já não existem são apagados", async () => {
    const db = await createTestDb();
    const uid = DEMO_PLATFORM_ADMIN.userId;
    expect(await savePlatformSubscription(db, uid, sub(1))).toBe(true);
    expect(await savePlatformSubscription(db, uid, sub(1))).toBe(true); // o mesmo aparelho não fica duas vezes
    expect(await savePlatformSubscription(db, uid, { endpoint: "nada" })).toBe(false);

    const seen: string[] = [];
    const ok = async (s: { endpoint: string }) => (seen.push(s.endpoint), { statusCode: 201 });
    expect(await notifyPlatformAdmins(db, { title: "t", body: "b", tag: "x", url: "/central" }, ok)).toBe(1);
    expect(seen).toEqual([sub(1).endpoint]);
    expect(await notifyPlatformTest(db, uid, ok)).toBe(1);

    const gone = async () => Promise.reject(Object.assign(new Error("gone"), { statusCode: 410 }));
    expect(await notifyPlatformTest(db, uid, gone)).toBe(0);
    expect(await notifyPlatformTest(db, uid, ok)).toBe(0); // foi apagado

    await savePlatformSubscription(db, uid, sub(2));
    await removePlatformSubscription(db, uid, sub(2).endpoint);
    expect(await notifyPlatformTest(db, uid, ok)).toBe(0);
  });
});
