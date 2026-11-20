import { z } from "zod";
import { getDb } from "@/server/db/client";
import { addEmployee, establishmentTimezone, kioskToken, listEmployees, listEntries, NAME_SCHEMA, pairShifts, PIN_SCHEMA, updateEmployee } from "@/server/clock/clock-service";
import { addDays, localDate, localMidnight } from "@/server/clock/clock-dates";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Picar ponto no painel: funcionários, link do tablet e registos entre duas datas (por omissão, os últimos 7 dias). */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  const tz = await establishmentTimezone(db, ctx);
  const url = new URL(request.url);
  const today = localDate(new Date(), tz);
  const to = day.safeParse(url.searchParams.get("ate")).data ?? today;
  const from = day.safeParse(url.searchParams.get("de")).data ?? addDays(to, -6);
  if (from > to || addDays(from, 62) < to) return json({ message: "Escolha um período até 2 meses." }, 400);
  const entries = await listEntries(db, ctx, localMidnight(from, tz), localMidnight(addDays(to, 1), tz));
  return json({
    timezone: tz,
    today,
    from,
    to,
    employees: await listEmployees(db, ctx),
    kioskToken: await kioskToken(db, ctx),
    entries,
    shifts: pairShifts(entries),
  });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), name: NAME_SCHEMA, pin: PIN_SCHEMA }),
  z.object({ action: z.literal("update"), id: z.uuid(), name: NAME_SCHEMA.optional(), pin: PIN_SCHEMA.optional(), active: z.boolean().optional() }),
  z.object({ action: z.literal("newLink") }),
]);

export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: parsed.error.issues[0]?.message?.startsWith("O PIN") ? parsed.error.issues[0].message : "Verifique o nome e o PIN (4 algarismos)." }, 400);
  const db = await getDb();
  const d = parsed.data;
  if (d.action === "add") return json(await addEmployee(db, ctx, d.name, d.pin));
  if (d.action === "update") {
    const ok = await updateEmployee(db, ctx, d.id, { name: d.name, pin: d.pin, active: d.active });
    return ok ? json({ ok: true }) : json({ message: "Funcionário não encontrado." }, 404);
  }
  return json({ kioskToken: await kioskToken(db, ctx, true) });
}
