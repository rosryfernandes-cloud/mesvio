import "server-only";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getCurrentUserId } from "@/server/auth/current-user";
import { can, preferredEstablishmentFromCookies, resolveStaffContext, type Permission, type StaffContext } from "./context";
import { isSameOrigin } from "./session";

/** Contexto do utilizador autenticado no painel, ou null (sem sessão ou sem acesso a nenhum restaurante). */
export async function getStaffContext(): Promise<StaffContext | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  return resolveStaffContext(await getDb(), userId, await preferredEstablishmentFromCookies());
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Guarda das rotas do painel: sessão válida, permissão do perfil e, em pedidos que alteram
 * dados, origem da própria app (CSRF). Devolve o contexto ou a resposta de erro a enviar.
 */
export async function guardStaff(
  request: Request,
  { mutating, permission }: { mutating: boolean; permission?: Permission },
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
  return ctx;
}

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
