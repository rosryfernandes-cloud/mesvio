// Cria (ou atualiza) o restaurante de demonstração numa base Supabase e, opcionalmente, dá a um
// utilizador já convidado na Supabase Auth o perfil de dono dessa demo, para entrar no painel.
//
// Uso (depois de `npm run db:migrate:producao`):
//   npm run demo:supabase -- --confirmar
//   npm run demo:supabase -- --confirmar --dono=email@do-dono.pt
//
// Lê DIRECT_DATABASE_URL (ou DATABASE_URL) de .env.production.local ou do ambiente. Idempotente.
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/server/db/schema";
import { memberships, staffProfiles } from "@/server/db/schema";
import { seedDemo } from "@/server/db/seed-demo";
import type { Db } from "@/server/db/client";
import { DEMO_ORGANIZATION, DEMO_TABLES } from "@/server/pos/mock/demo-data";

try {
  process.loadEnvFile(".env.production.local");
} catch {
  // sem ficheiro: usar as variáveis do ambiente
}

const args = process.argv.slice(2);
const confirmed = args.includes("--confirmar");
const ownerEmail = args.find((a) => a.startsWith("--dono="))?.slice("--dono=".length).trim().toLowerCase();
const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
  console.error("✗ Falta DIRECT_DATABASE_URL (em .env.production.local ou no ambiente).");
  process.exit(1);
}
const host = new URL(url).hostname;
if (!confirmed) {
  console.log(`Vai criar/atualizar a demo em ${host}. Repita com --confirmar para avançar.`);
  process.exit(0);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client, { schema }) as unknown as Db;

try {
  const [{ ok }] = await client`select exists (
    select 1 from information_schema.columns where table_name = 'establishments' and column_name = 'brand_color'
  ) as ok`;
  if (!ok) throw new Error("A base ainda não tem as migrações todas. Corra primeiro: npm run db:migrate:producao");

  await seedDemo(db, { users: false });
  console.log(`✓ Demo criada/atualizada em ${host}: ${DEMO_TABLES.length} lugares.`);

  if (ownerEmail) {
    const [user] = await client<{ id: string }[]>`select id from auth.users where lower(email) = ${ownerEmail} limit 1`;
    if (!user) {
      throw new Error(`Não existe ${ownerEmail} na Supabase Auth. Convide-o primeiro (Authentication → Users → Invite) e repita.`);
    }
    await db.transaction(async (tx) => {
      await tx
        .insert(staffProfiles)
        .values({ userId: user.id, email: ownerEmail, displayName: ownerEmail.split("@")[0] })
        .onConflictDoNothing();
      const existing = await tx.$count(
        memberships,
        and(eq(memberships.userId, user.id), eq(memberships.organizationId, DEMO_ORGANIZATION.id)),
      );
      if (existing === 0) {
        await tx.insert(memberships).values({ organizationId: DEMO_ORGANIZATION.id, userId: user.id, role: "owner", establishmentId: null });
      } else {
        await tx
          .update(memberships)
          .set({ role: "owner", establishmentId: null })
          .where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, DEMO_ORGANIZATION.id)));
      }
    });
    console.log(`✓ ${ownerEmail} é dono da demo: entra em /painel/entrar com o código enviado por email.`);
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://<o-seu-dominio>").replace(/\/$/, "");
  console.log(`\nAbrir: ${base}/demo\nPrimeira mesa: ${base}/m/${DEMO_TABLES[0].publicToken}`);
} catch (err) {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
