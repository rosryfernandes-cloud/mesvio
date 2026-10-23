import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Cliente Supabase com a sessão do utilizador (cookies). Para rotas e páginas do servidor. */
export async function createSupabaseServerClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Em Server Components não se podem escrever cookies; o proxy.ts renova a sessão.
        }
      },
    },
  });
}

/**
 * Cliente com a service role (convites de utilizadores). Só no servidor; a chave nunca
 * chega ao browser.
 */
export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não definida (necessária para convidar utilizadores).");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
