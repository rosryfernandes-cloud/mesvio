import { z } from "zod";
import { getDb } from "@/server/db/client";
import { dailyMenuSectionsSchema, dailyMenuSettingsSchema, getDailyMenuPanel, saveDailyMenuSettings, saveTodayMenu } from "@/server/menu/daily-menu";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";

/** Estado do menu do dia no painel: definições, o menu de hoje e o anterior. */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  return json(await getDailyMenuPanel(await getDb(), ctx));
}

const schema = z.object({ sections: dailyMenuSectionsSchema.optional(), settings: dailyMenuSettingsSchema.optional() });

/** Grava o menu de hoje e/ou as definições (o que inclui, hora do almoço, dias). */
export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "Verifique os pratos e os preços." }, 400);
  const db = await getDb();
  if (parsed.data.settings) await saveDailyMenuSettings(db, ctx, parsed.data.settings);
  const saved = parsed.data.sections ? await saveTodayMenu(db, ctx, parsed.data.sections) : null;
  return json({ ok: true, saved });
}
