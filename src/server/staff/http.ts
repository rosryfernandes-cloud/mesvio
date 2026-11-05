import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getCurrentUserId } from "@/server/auth/current-user";
import { can, preferredEstablishmentFromCookies, resolveStaffContext, type Permission, type StaffContext } from "./context";
import { isSameOrigin } from "./session";
import { getPlatformState } from "@/server/platform/admin-auth";
import { resolveSupportContext, SUPPORT_COOKIE } from "@/server/platform/support";

/** Contexto do utilizador autenticado no painel, ou null (sem sessão ou sem acesso a nenhum restaurante). */
export async function getStaffContext(): Promise<StaffContext | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const db = await getDb();
  const support = (await cookies()).get(SUPPORT_COOKIE)?.value;
  // Com modo suporte pedido, ou vale ou o painel fecha: nunca abre em silêncio outro restaurante.
  if (support) {
    const state = await getPlatformState(db);
    return resolveSupportContext(db, userId, support, state.kind === "ok");
  }
  return resolveStaffContext(db, userId, await preferredEstablishmentFromCookies());
}

const NO_STORE = { "Cache-Control": "no-store" };

/** Resposta às ações que ficam só para quem é do restaurante (equipa, pagamentos, este aparelho). */
export const supportBlocked = () =>
  NextResponse.json({ code: "SUPPORT_BLOCKED", message: "Em modo suporte, esta ação fica para o dono do restaurante." }, { status: 403, headers: NO_STORE });

/**
 * Guarda das rotas do painel: sessão válida, permissão do perfil e, em pedidos que alteram
 * dados, origem da própria app (CSRF). Devolve o contexto ou a resposta de erro a enviar.
 */
export async function guardStaff(
  request: Request,
  { mutating, permission, blockSupport }: { mutating: boolean; permission?: Permission; blockSupport?: boolean },
): Promise<StaffContext | NextResponse> {
  if (mutating && !isSameOrigin(request)) {
    return NextResponse.json({ code: "FORBIDDEN", message: "Pedido recusado." }, { status: 403, headers: NO_STORE });
  }
  const ctx = await getStaffContext();
  if (!ctx) {
    return NextResponse.json({ code: "UNAUTHENTICATED", message: "Sessão expirada. Entre de novo." }, { status: 401, headers: NO_STORE });
  }
  if (permission && !can(ctx, permission)) {
    return NextResponse.json({ code: "FORBIDDEN", message: "O seu perfil não permite esta ação." }, { status: 403, headers: NO_STORE });
  }
  if (blockSupport && ctx.support) return supportBlocked();
  return ctx;
}

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
