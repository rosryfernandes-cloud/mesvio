import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { DEMO_PLATFORM_ADMIN, DEMO_USERS } from "@/server/db/seed-demo";
import { DEMO_ESTABLISHMENT } from "@/server/pos/mock/demo-data";
import type { UserDirectory } from "@/server/auth/user-directory";
import { resolveStaffContext } from "@/server/staff/context";
import { encodeSigned } from "@/server/staff/session";
import { getBoard } from "@/server/staff/staff-service";
import { findPlatformAdmin, type PlatformAdmin } from "./admin-auth";
import { createRestaurant } from "./platform-service";
import { endSupport, readSupportCookie, resolveSupportContext, startSupport, supportCookie, type SupportSession } from "./support";

const users: UserDirectory = {
  async ensureUser() {
    return { userId: randomUUID(), invited: true };
  },
};
const input = {
  legalName: "Praia Azul, Lda.",
  nif: "509999999",
  name: "Bar Praia Azul",
  slug: "praia-azul",
  posProvider: "mock" as const,
  commissionBps: 0,
  tables: [{ count: 2, prefix: "Mesa", zone: "Esplanada", orderingMode: "pay_later" as const }],
  owner: { email: "dono@praiaazul.pt", displayName: "João" },
};

let db: Db;
let admin: PlatformAdmin;
let otherEstablishmentId: string;

beforeEach(async () => {
  db = await createTestDb();
  admin = (await findPlatformAdmin(db, DEMO_PLATFORM_ADMIN.userId))!;
  const r = await createRestaurant(db, admin, input, users);
  if (!r.ok) throw new Error(r.message);
  otherEstablishmentId = r.establishmentId;
});

const cookieFor = (session: SupportSession, now?: number) => supportCookie(session, now).value;

async function session(): Promise<SupportSession> {
  const s = await startSupport(db, admin, otherEstablishmentId);
  if (!s) throw new Error("sem sessão");
  return s;
}

describe("modo suporte", () => {
  it("abre só o restaurante escolhido, como dono, sem entrar na equipa dele", async () => {
    const ctx = await resolveSupportContext(db, admin.userId, cookieFor(await session()), true);
    expect(ctx).toMatchObject({ establishmentId: otherEstablishmentId, establishmentName: "Bar Praia Azul", role: "owner", support: true });
    expect(ctx!.establishments.map((e) => e.id)).toEqual([otherEstablishmentId]);
    const memberships = await db.select().from(t.memberships).where(eq(t.memberships.userId, admin.userId));
    expect(memberships).toHaveLength(0);
  });

  it("os dados são os desse restaurante, e não os de outro", async () => {
    const ctx = (await resolveSupportContext(db, admin.userId, cookieFor(await session()), true))!;
    await expect(getBoard(db, ctx)).resolves.toBeDefined();
    const [e] = await db.select({ org: t.establishments.organizationId }).from(t.establishments).where(eq(t.establishments.id, otherEstablishmentId));
    expect(ctx.organizationId).toBe(e!.org);
    expect(ctx.establishmentId).not.toBe(DEMO_ESTABLISHMENT.id);
  });

  it("recusa sem 2FA verificado", async () => {
    expect(await resolveSupportContext(db, admin.userId, cookieFor(await session()), false)).toBeNull();
  });

  it("recusa o cookie noutro utilizador, como um dono normal", async () => {
    expect(await resolveSupportContext(db, DEMO_USERS[0].userId, cookieFor(await session()), true)).toBeNull();
  });

  it("recusa um cookie alterado, de outro tipo ou expirado", async () => {
    const value = cookieFor(await session());
    const [payload, mac] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ u: admin.userId, e: DEMO_ESTABLISHMENT.id, n: "x", x: Date.now() + 1000 })).toString("base64url");
    expect(await resolveSupportContext(db, admin.userId, `${forged}.${mac}`, true)).toBeNull();
    expect(await resolveSupportContext(db, admin.userId, `${payload}.errado`, true)).toBeNull();
    // Um cookie assinado de outra coisa (como o da sessão do 2FA) não abre o modo suporte.
    expect(await resolveSupportContext(db, admin.userId, encodeSigned({ u: admin.userId }, Date.now() + 1000), true)).toBeNull();
    const past = Date.now() - 9 * 3600_000;
    expect(await resolveSupportContext(db, admin.userId, cookieFor(await session(), past), true)).toBeNull();
    expect(readSupportCookie(undefined)).toBeNull();
  });

  it("recusa um restaurante que não existe", async () => {
    expect(await startSupport(db, admin, randomUUID())).toBeNull();
    const ghost = { userId: admin.userId, establishmentId: randomUUID(), establishmentName: "Fantasma" };
    expect(await resolveSupportContext(db, admin.userId, cookieFor(ghost), true)).toBeNull();
  });

  it("regista a entrada e a saída, com quem e em que restaurante", async () => {
    const s = await session();
    await endSupport(db, admin, s);
    const logs = await db.select().from(t.auditLogs).where(and(eq(t.auditLogs.actorId, admin.userId), eq(t.auditLogs.entityId, otherEstablishmentId)));
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("platform.support_start");
    expect(actions).toContain("platform.support_end");
    expect(logs.find((l) => l.action === "platform.support_start")).toMatchObject({ actorType: "admin", entityType: "establishment" });
  });

  it("o dono normal continua sem marca de suporte e só com o seu restaurante", async () => {
    const ctx = await resolveStaffContext(db, DEMO_USERS[0].userId);
    expect(ctx?.support).toBeUndefined();
    expect(ctx?.establishments.map((e) => e.id)).not.toContain(otherEstablishmentId);
  });
});
