import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { staffProfiles } from "@/server/db/schema";
import { authMode } from "./config";
import { createSupabaseAdminClient } from "./supabase";

/** O email do convite não saiu (o motivo da Supabase vai para o painel, para se perceber o que falta). */
export class InviteError extends Error {}

/** Mensagem clara para quem convida, a partir do erro da Supabase. */
export function inviteErrorText(reason: string): string {
  if (/rate limit/i.test(reason)) return "Já se enviaram demasiados emails nesta hora. Tente de novo mais tarde.";
  if (/sending|smtp|email/i.test(reason)) {
    return "O servidor de email recusou o envio. Confirme que o domínio está verificado no Resend e o remetente na Supabase.";
  }
  return `Não foi possível enviar o convite (${reason.slice(0, 120)}).`;
}

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
        if (!error && data.user) return { userId: data.user.id, invited: true };
        // Já tem conta na Supabase (ex.: um convite anterior que não chegou a ser aceite): usa essa
        // conta; a pessoa entra com o código por email, como toda a gente.
        if (error && /already (been )?registered|email_exists/i.test(`${error.code ?? ""} ${error.message}`)) {
          for (let page = 1; page <= 20; page++) {
            const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
            const found = list?.users.find((u) => u.email?.toLowerCase() === email);
            if (found) return { userId: found.id, invited: false };
            if (!list || list.users.length < 200) break;
          }
        }
        throw new InviteError(error?.message ?? "Convite falhou");
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
