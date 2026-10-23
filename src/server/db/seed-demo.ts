import "server-only";
import { DEMO_ESTABLISHMENT, DEMO_ORGANIZATION, DEMO_PRODUCTS, DEMO_TABLES } from "@/server/pos/mock/demo-data";
import { demoTranslationRows } from "@/server/pos/mock/demo-translations";
import { eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { diningTables, establishments, memberships, menuTranslations, organizations, platformAdmins, posIntegrations, staffProfiles } from "./schema";

/**
 * Utilizadores de demonstração (só dev/testes, sem Supabase): entram no painel pelo modo de
 * desenvolvimento, sem password. Os emails usam o domínio reservado example.com.
 */
export const DEMO_USERS = [
  { userId: "00000000-0000-4000-8000-0000000002a1", email: "dona@example.com", displayName: "Ana (dona, demo)", role: "owner", wholeOrganization: true },
  { userId: "00000000-0000-4000-8000-0000000002a2", email: "gerente@example.com", displayName: "Bruno (gerente, demo)", role: "manager", wholeOrganization: false },
  { userId: "00000000-0000-4000-8000-0000000002a3", email: "sala@example.com", displayName: "Carla (sala, demo)", role: "staff", wholeOrganization: false },
] as const;

/** Administradora da plataforma de demonstração (painel central). Configura o 2FA na primeira entrada. */
export const DEMO_PLATFORM_ADMIN = { userId: "00000000-0000-4000-8000-0000000002f1", email: "plataforma@example.com", displayName: "Paula (plataforma, demo)" } as const;

/**
 * Organização, estabelecimento, mesas e integração MockPOS da demonstração. Idempotente.
 * `users: false` (demo online na Supabase): sem os utilizadores fictícios, que lá não conseguem entrar.
 */
export async function seedDemo(db: Db, { users = true }: { users?: boolean } = {}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values({ id: DEMO_ORGANIZATION.id, legalName: DEMO_ORGANIZATION.legalName, nif: DEMO_ORGANIZATION.nif, status: "active" })
      // Atualiza a demo se o restaurante de demonstração mudar (a base local pode ser antiga).
      .onConflictDoUpdate({ target: organizations.id, set: { legalName: DEMO_ORGANIZATION.legalName } });
    await tx
      .insert(establishments)
      .values({
        id: DEMO_ESTABLISHMENT.id,
        organizationId: DEMO_ORGANIZATION.id,
        name: DEMO_ESTABLISHMENT.name,
        slug: DEMO_ESTABLISHMENT.slug,
        address: DEMO_ESTABLISHMENT.address,
        timezone: DEMO_ESTABLISHMENT.timezone,
        paymentsEnabled: true,
        stripeAccountId: process.env.STRIPE_DEMO_CONNECTED_ACCOUNT || null,
      })
      .onConflictDoUpdate({
        target: establishments.id,
        set: {
          name: DEMO_ESTABLISHMENT.name,
          slug: DEMO_ESTABLISHMENT.slug,
          address: DEMO_ESTABLISHMENT.address,
          // A conta Stripe de teste da demo vem do .env.local (se existir).
          ...(process.env.STRIPE_DEMO_CONNECTED_ACCOUNT ? { stripeAccountId: process.env.STRIPE_DEMO_CONNECTED_ACCOUNT } : {}),
        },
      });
    if (users) {
      await tx
        .insert(staffProfiles)
        .values(DEMO_USERS.map(({ userId, email, displayName }) => ({ userId, email, displayName })))
        .onConflictDoNothing();
    }
    if (users) await tx.insert(platformAdmins).values(DEMO_PLATFORM_ADMIN).onConflictDoNothing();
    for (const u of users ? DEMO_USERS : []) {
      const exists = await tx.$count(memberships, eq(memberships.userId, u.userId));
      if (exists === 0) {
        await tx.insert(memberships).values({
          organizationId: DEMO_ORGANIZATION.id,
          userId: u.userId,
          role: u.role,
          establishmentId: u.wholeOrganization ? null : DEMO_ESTABLISHMENT.id,
        });
      }
    }
    await tx
      .insert(posIntegrations)
      .values({ organizationId: DEMO_ORGANIZATION.id, establishmentId: DEMO_ESTABLISHMENT.id, provider: "mock", status: "healthy" })
      .onConflictDoNothing();
    await tx
      .insert(diningTables)
      .values(
        DEMO_TABLES.map((t) => ({
          id: t.id,
          organizationId: DEMO_ORGANIZATION.id,
          establishmentId: DEMO_ESTABLISHMENT.id,
          label: t.label,
          posTableRef: t.posTableRef,
          publicToken: t.publicToken,
          active: t.active,
          zone: t.zone,
          orderingMode: t.orderingMode,
        })),
      )
      // Bases locais antigas: acrescentar zona e modo às mesas que já existiam. O token e o estado
      // voltam aos da demo: os links fixos de /demo têm de funcionar mesmo depois de testar
      // "Novo QR Code" ou "Desativar" num lugar de demonstração.
      .onConflictDoUpdate({
        target: diningTables.id,
        set: {
          label: sql`excluded.label`,
          zone: sql`excluded.zone`,
          orderingMode: sql`excluded.ordering_mode`,
          publicToken: sql`excluded.public_token`,
          active: sql`excluded.active`,
        },
      });

    // Traduções da ementa: só acrescenta as que faltam (as editadas no painel não são substituídas).
    const modifiers = DEMO_PRODUCTS.flatMap((p) => p.modifierGroups.flatMap((g) => g.modifiers.map((m) => ({ ref: m.posModifierRef, name: m.name }))));
    const unique = [...new Map(modifiers.map((m) => [m.ref, m])).values()];
    const rows = demoTranslationRows(unique).map((r) => ({ ...r, organizationId: DEMO_ORGANIZATION.id, establishmentId: DEMO_ESTABLISHMENT.id }));
    for (let i = 0; i < rows.length; i += 200) await tx.insert(menuTranslations).values(rows.slice(i, i + 200)).onConflictDoNothing();
  });
}
