import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { staffProfiles } from "@/server/db/schema";
import { authMode } from "./config";
import { createSupabaseAdminClient } from "./supabase";

/** Diretório de identidades: obtém (ou cria por convite) o utilizador de um email. */
export interface UserDirectory {
  /** Id do utilizador com este email. Se ainda não existir, convida-o (a Supabase envia o email). */
  ensureUser(email: string): Promise<{ userId: string; invited: boolean }>;
}

/** Procura um perfil já conhecido (o utilizador pode já trabalhar noutro restaurante). Serviço de sistema. */
async function knownUserId(root: Db, email: string): Promise<string | null> {
  const [row] = await root.select({ id: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.email, email));
  return row?.id ?? null;
}

export function createUserDirectory(root: Db): UserDirectory {
  if (authMode() === "supabase") {
    return {
      async ensureUser(email) {
        const known = await knownUserId(root, email);
        if (known) return { userId: known, invited: false };
        const admin = createSupabaseAdminClient();
        const redirectTo = `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "")}/painel/auth/confirmar`;
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
        if (error || !data.user) throw new Error(error?.message ?? "Convite falhou");
        return { userId: data.user.id, invited: true };
      },
    };
  }
  // Desenvolvimento: sem email; o novo utilizador aparece na lista de entrada do modo dev.
  return {
    async ensureUser(email) {
      return { userId: (await knownUserId(root, email)) ?? randomUUID(), invited: false };
    },
  };
}
