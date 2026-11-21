import { z } from "zod";
import { getDb } from "@/server/db/client";
import { findPlatformAdmin } from "@/server/platform/admin-auth";
import { addEmployee, addManualEntry, computeAlerts, deleteEntry, laborCost, DESCRIPTOR_SCHEMA, editEntryTime, establishmentTimezone, getFaceEnabled, KIND_SCHEMA, kioskToken, listCorrections, listEmployees, listEntries, NAME_SCHEMA, pairShifts, PIN_SCHEMA, setEmployeeFace, setFaceEnabled, updateEmployee } from "@/server/clock/clock-service";
import { addDays, localDate, localMidnight } from "@/server/clock/clock-dates";
import { attendance, getNotify, getSchedules, setNotify } from "@/server/clock/clock-schedule";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Picar ponto no painel: funcionários, link do tablet e registos entre duas datas (por omissão, os últimos 7 dias). */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  // Picar ponto em testes: só a equipa MESVIO (ver staff-panel.tsx).
  if (!(await findPlatformAdmin(await getDb(), ctx.userId))) return new Response("Não encontrado", { status: 404 });
  const db = await getDb();
  const tz = await establishmentTimezone(db, ctx);
  const url = new URL(request.url);
  const today = localDate(new Date(), tz);
  const to = day.safeParse(url.searchParams.get("ate")).data ?? today;
  const from = day.safeParse(url.searchParams.get("de")).data ?? addDays(to, -6);
  if (from > to || addDays(from, 62) < to) return json({ message: "Escolha um período até 2 meses." }, 400);
  const entries = await listEntries(db, ctx, localMidnight(from, tz), localMidnight(addDays(to, 1), tz));
  const shifts = pairShifts(entries);
  const employees = await listEmployees(db, ctx);
  return json({
    timezone: tz,
    today,
    from,
    to,
    employees,
    cost: laborCost(shifts, new Map(employees.map((e) => [e.id, e.hourlyCents])), tz),
    kioskToken: await kioskToken(db, ctx),
    faceEnabled: await getFaceEnabled(db, ctx),
    corrections: await listCorrections(db, ctx, tz),
    entries,
    shifts,
    alerts: computeAlerts(shifts, tz),
    notify: await getNotify(db, ctx),
    attendance: attendance(await getSchedules(db, ctx, from, to), shifts, new Map(employees.map((e) => [e.id, e.name])), tz),
  });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), name: NAME_SCHEMA, pin: PIN_SCHEMA }),
  z.object({ action: z.literal("update"), id: z.uuid(), name: NAME_SCHEMA.optional(), pin: PIN_SCHEMA.optional(), active: z.boolean().optional(), hourlyCents: z.int().min(0).max(100_000).nullable().optional() }),
  z.object({ action: z.literal("newLink") }),
  z.object({ action: z.literal("faceEnabled"), enabled: z.boolean() }),
  z.object({ action: z.literal("face"), id: z.uuid(), samples: z.array(DESCRIPTOR_SCHEMA).min(2).max(6) }),
  z.object({ action: z.literal("faceRemove"), id: z.uuid() }),
  z.object({ action: z.literal("addEntry"), employeeId: z.uuid(), kind: KIND_SCHEMA, at: z.iso.datetime({ offset: true }) }),
  z.object({ action: z.literal("editEntry"), id: z.uuid(), at: z.iso.datetime({ offset: true }) }),
  z.object({ action: z.literal("deleteEntry"), id: z.uuid() }),
  z.object({ action: z.literal("notify"), on: z.boolean() }),
]);

export async function POST(request: Request) {
  const ctx = await guardStaff(request, { mutating: true, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  // Picar ponto em testes: só a equipa MESVIO (ver staff-panel.tsx).
  if (!(await findPlatformAdmin(await getDb(), ctx.userId))) return new Response("Não encontrado", { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: parsed.error.issues[0]?.message?.startsWith("O PIN") ? parsed.error.issues[0].message : "Verifique o nome e o PIN (4 algarismos)." }, 400);
  const db = await getDb();
  const d = parsed.data;
  if (d.action === "add") return json(await addEmployee(db, ctx, d.name, d.pin));
  if (d.action === "update") {
    const ok = await updateEmployee(db, ctx, d.id, { name: d.name, pin: d.pin, active: d.active, hourlyCents: d.hourlyCents });
    return ok ? json({ ok: true }) : json({ message: "Funcionário não encontrado." }, 404);
  }
  if (d.action === "faceEnabled") {
    await setFaceEnabled(db, ctx, d.enabled);
    return json({ ok: true });
  }
  if (d.action === "face" || d.action === "faceRemove") {
    if (d.action === "face" && !(await getFaceEnabled(db, ctx))) return json({ message: "Ligue primeiro o reconhecimento facial." }, 409);
    const ok = await setEmployeeFace(db, ctx, d.id, d.action === "face" ? d.samples : null);
    return ok ? json({ ok: true }) : json({ message: "Funcionário não encontrado." }, 404);
  }
  if (d.action === "addEntry" || d.action === "editEntry") {
    const at = new Date(d.at);
    if (at.getTime() > Date.now() + 5 * 60_000) return json({ message: "Não pode registar horas no futuro." }, 400);
    const ok = d.action === "addEntry" ? await addManualEntry(db, ctx, d.employeeId, d.kind, at) : await editEntryTime(db, ctx, d.id, at);
    return ok ? json({ ok: true }) : json({ message: "Registo não encontrado." }, 404);
  }
  if (d.action === "notify") {
    await setNotify(db, ctx, d.on);
    return json({ ok: true });
  }
  if (d.action === "deleteEntry") return (await deleteEntry(db, ctx, d.id)) ? json({ ok: true }) : json({ message: "Registo não encontrado." }, 404);
  return json({ kioskToken: await kioskToken(db, ctx, true) });
}
