import "server-only";
import { randomBytes } from "node:crypto";
import { desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { menuPreviews } from "@/server/db/schema";
import { notifyPlatformAdmins, queuePush } from "@/server/notifications/push";
import type { PlatformAdmin } from "./admin-auth";

/**
 * Pré-visualizações para potenciais clientes: a equipa MESVIO lê a ementa de um restaurante na
 * Demonstração da Central e envia ao dono um link privado (/p/<token>) com a ementa dele já
 * digital. O link expira; abrir e "Quero ativar" avisam a equipa no telemóvel.
 */
export const PREVIEW_TTL_DAYS = 30;
/** Depois de expirar, ainda fica na lista da Central este tempo (para o seguimento); depois apaga-se. */
const KEEP_AFTER_EXPIRY_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export const PREVIEW_LOCALES = ["en", "es", "fr", "de"] as const;

const translation = z.object({ name: z.string().trim().min(1).max(200), description: z.string().trim().max(1000).optional() });

export const createPreviewSchema = z.object({
  restaurantName: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(1000).optional(),
  menu: z.object({
    categories: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          products: z
            .array(
              z.object({
                name: z.string().trim().min(1).max(80),
                description: z.string().trim().max(300).nullable(),
                priceCents: z.int().min(0).max(1000_00).nullable(),
                // Só fotos em https (a página do link é https); as outras ficam de fora.
                imageUrl: z
                  .string()
                  .max(2000)
                  .nullable()
                  .transform((v) => (v && /^https:\/\/[^\s]+$/.test(v) ? v : null)),
              }),
            )
            .min(1)
            .max(200),
        }),
      )
      .min(1)
      .max(40),
  }),
  translations: z.partialRecord(z.enum(PREVIEW_LOCALES), z.record(z.string().max(20), translation)).default({}),
});

export type MenuPreview = typeof menuPreviews.$inferSelect;

const TOKEN_RE = /^[A-Za-z0-9_-]{16,40}$/;

export async function createPreview(db: Db, admin: PlatformAdmin, raw: unknown, now = new Date()): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  const parsed = createPreviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Dê um nome ao restaurante e leia a ementa primeiro." };
  const token = randomBytes(12).toString("base64url");
  await db.insert(menuPreviews).values({
    token,
    restaurantName: parsed.data.restaurantName,
    notes: parsed.data.notes || null,
    menu: parsed.data.menu,
    translations: parsed.data.translations,
    createdBy: admin.userId,
    expiresAt: new Date(now.getTime() + PREVIEW_TTL_DAYS * DAY_MS),
  });
  return { ok: true, token };
}

export async function listPreviews(db: Db) {
  return db
    .select({
      id: menuPreviews.id,
      token: menuPreviews.token,
      restaurantName: menuPreviews.restaurantName,
      notes: menuPreviews.notes,
      createdAt: menuPreviews.createdAt,
      expiresAt: menuPreviews.expiresAt,
      viewCount: menuPreviews.viewCount,
      firstViewedAt: menuPreviews.firstViewedAt,
      lastViewedAt: menuPreviews.lastViewedAt,
      activationRequestedAt: menuPreviews.activationRequestedAt,
      activationContact: menuPreviews.activationContact,
    })
    .from(menuPreviews)
    .orderBy(desc(menuPreviews.createdAt))
    .limit(200);
}

/** A pré-visualização de um link, ou null se não existir ou já tiver expirado. */
export async function getPreviewByToken(db: Db, token: string, now = new Date()): Promise<MenuPreview | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [row] = await db.select().from(menuPreviews).where(eq(menuPreviews.token, token)).limit(1);
  return row && row.expiresAt > now ? row : null;
}

/** O dono abriu o link (contado pelo navegador, não por pré-visualizações automáticas de links). */
export async function recordPreviewView(db: Db, token: string, now = new Date()): Promise<boolean> {
  const p = await getPreviewByToken(db, token, now);
  if (!p) return false;
  await db
    .update(menuPreviews)
    .set({ viewCount: sql`${menuPreviews.viewCount} + 1`, firstViewedAt: p.firstViewedAt ?? now, lastViewedAt: now })
    .where(eq(menuPreviews.id, p.id));
  if (!p.firstViewedAt) {
    queuePush((sys) =>
      notifyPlatformAdmins(sys, { title: "Abriram a ementa 👀", body: `${p.restaurantName} abriu a pré-visualização. Bom momento para ligar.`, tag: `preview-${p.id}`, url: "/central/demonstracao" }),
    );
  }
  return true;
}

export const activationSchema = z.object({ contact: z.string().trim().max(200).optional() });

/** "Quero ativar": regista o pedido (e o contacto, se o deixou) e avisa a equipa. */
export async function requestActivation(db: Db, token: string, raw: unknown, now = new Date()): Promise<boolean> {
  const p = await getPreviewByToken(db, token, now);
  const parsed = activationSchema.safeParse(raw);
  if (!p || !parsed.success) return false;
  await db
    .update(menuPreviews)
    .set({ activationRequestedAt: p.activationRequestedAt ?? now, activationContact: parsed.data.contact || p.activationContact })
    .where(eq(menuPreviews.id, p.id));
  queuePush((sys) =>
    notifyPlatformAdmins(sys, {
      title: "Quer ativar a MESVIO! 🎉",
      body: `${p.restaurantName}${parsed.data.contact ? ` · ${parsed.data.contact}` : ""}`,
      tag: `preview-ativar-${p.id}`,
      url: "/central/demonstracao",
    }),
  );
  return true;
}

export async function deletePreview(db: Db, id: string): Promise<boolean> {
  return (await db.delete(menuPreviews).where(eq(menuPreviews.id, id)).returning({ id: menuPreviews.id })).length > 0;
}

/** Apaga as pré-visualizações expiradas há mais de 60 dias. */
export async function prunePreviews(db: Db, now = new Date()): Promise<void> {
  await db.delete(menuPreviews).where(lt(menuPreviews.expiresAt, new Date(now.getTime() - KEEP_AFTER_EXPIRY_DAYS * DAY_MS)));
}
