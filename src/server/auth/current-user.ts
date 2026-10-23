import "server-only";
import { cookies } from "next/headers";
import { authMode } from "./config";
import { createSupabaseServerClient } from "./supabase";
import { decodeSigned, encodeSigned } from "@/server/staff/session";

export const DEV_USER_COOKIE = "painel_dev_user";
const DEV_SESSION_MS = 12 * 3600_000;

/** Id do utilizador autenticado no painel, ou null. */
export async function getCurrentUserId(): Promise<string | null> {
  const mode = authMode();
  if (mode === "supabase") {
    const supabase = await createSupabaseServerClient();
    // getUser() valida o token junto da Supabase (ao contrário de getSession(), que só lê o cookie).
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  }
  if (mode === "dev") {
    const data = decodeSigned((await cookies()).get(DEV_USER_COOKIE)?.value);
    return typeof data?.u === "string" ? data.u : null;
  }
  return null;
}

export function devUserCookieValue(userId: string): string {
  return encodeSigned({ u: userId }, Date.now() + DEV_SESSION_MS);
}

export const DEV_SESSION_SECONDS = DEV_SESSION_MS / 1000;
