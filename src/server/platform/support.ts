import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { auditLogs, establishments } from "@/server/db/schema";
import type { StaffContext } from "@/server/staff/context";
import { decodeSigned, encodeSigned } from "@/server/staff/session";
import type { PlatformAdmin } from "./admin-auth";

/**
 * Modo suporte: a equipa MESVIO abre o painel de um restaurante a partir da central, sem entrar na
 * equipa dele. Vale só com administrador e 2FA verificado, é um cookie assinado preso ao utilizador
 * e a um restaurante, e cada entrada e saída fica no registo. Se deixar de valer, o painel fecha em
 * vez de cair sem aviso noutro restaurante (ver getStaffContext).
 */
export const SUPPORT_COOKIE = "mesvio_suporte";
const SUPPORT_SESSION_MS = 8 * 3600_000;
/** O cookie dura mais do que a assinatura: assim nota-se que expirou, em vez de desaparecer sem aviso. */
const SUPPORT_COOKIE_SECONDS = 7 * 86400;

export interface SupportSession {
  userId: string;
  establishmentId: string;
  establishmentName: string;
}

export function readSupportCookie(value: string | undefined, now = Date.now()): SupportSession | null {
  const data = decodeSigned(value, now);
  if (typeof data?.u !== "string" || typeof data.e !== "string" || typeof data.n !== "string") return null;
  return { userId: data.u, establishmentId: data.e, establishmentName: data.n };
}

export function supportCookie(session: SupportSession, now = Date.now()) {
  return {
    name: SUPPORT_COOKIE,
    value: encodeSigned({ u: session.userId, e: session.establishmentId, n: session.establishmentName }, now + SUPPORT_SESSION_MS),
    options: {
      httpOnly: true,
      // Lax e não strict: ao chegar de um link externo o cookie vai no primeiro pedido, por isso o
      // painel nunca mostra outro restaurante antes de o polling trazer os dados deste.
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SUPPORT_COOKIE_SECONDS,
    },
  };
}

async function findEstablishment(db: Db, establishmentId: string) {
  const [e] = await db
    .select({ id: establishments.id, name: establishments.name, organizationId: establishments.organizationId })
    .from(establishments)
    .where(eq(establishments.id, establishmentId))
    .limit(1);
  return e ?? null;
}

const audit = (db: Db, admin: PlatformAdmin, organizationId: string, action: string, establishmentId: string) =>
  db.insert(auditLogs).values({ organizationId, actorType: "admin", actorId: admin.userId, action, entityType: "establishment", entityId: establishmentId });

/** Entrada em modo suporte: confirma o restaurante, regista e devolve a sessão (null se não existir). */
export async function startSupport(db: Db, admin: PlatformAdmin, establishmentId: string): Promise<SupportSession | null> {
  const e = await findEstablishment(db, establishmentId);
  if (!e) return null;
  await audit(db, admin, e.organizationId, "platform.support_start", e.id);
  return { userId: admin.userId, establishmentId: e.id, establishmentName: e.name };
}

export async function endSupport(db: Db, admin: PlatformAdmin, session: SupportSession): Promise<void> {
  const e = await findEstablishment(db, session.establishmentId);
  if (e) await audit(db, admin, e.organizationId, "platform.support_end", e.id);
}

/**
 * Contexto do painel em modo suporte, ou null se o cookie não servir: assinatura errada ou expirada,
 * outro utilizador, administrador sem 2FA verificado ou restaurante inexistente.
 */
export async function resolveSupportContext(db: Db, userId: string, rawCookie: string, isVerifiedAdmin: boolean, now = Date.now()): Promise<StaffContext | null> {
  if (!isVerifiedAdmin) return null;
  const session = readSupportCookie(rawCookie, now);
  if (!session || session.userId !== userId) return null;
  const e = await findEstablishment(db, session.establishmentId);
  if (!e) return null;
  return {
    userId,
    organizationId: e.organizationId,
    establishmentId: e.id,
    establishmentName: e.name,
    role: "owner",
    displayName: "Suporte MESVIO",
    establishments: [{ id: e.id, name: e.name, role: "owner" }],
    support: true,
  };
}
