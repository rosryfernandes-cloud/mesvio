import "server-only";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { clockEmployees, clockEntries, clockSchedules, establishments } from "@/server/db/schema";
import type { StaffContext } from "@/server/staff/context";
import { notifyManagers, type PushSender } from "@/server/notifications/push";
import { addDays, localMidnight } from "./clock-dates";
import type { ClockShift } from "./clock-service";

/**
 * Escalas do picar ponto: o horário previsto de cada funcionário em cada dia. Serve para ver no
 * painel quem chegou a horas, atrasado ou não veio, e para avisar o dono no telemóvel.
 */

type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

export type Slot = { start: string; end: string };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const SLOT_SCHEMA = z.object({ start: z.string().regex(HHMM), end: z.string().regex(HHMM) });
export const WEEK_SCHEMA = z.array(z.object({ employeeId: z.uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slots: z.array(SLOT_SCHEMA).max(3) })).max(500);

/** Tolerância antes de contar como atraso, e quando se avisa que alguém não picou a entrada. */
export const LATE_TOLERANCE_MIN = 5;
export const ABSENT_AFTER_MIN = 15;
export const FORGOT_OUT_AFTER_MIN = 45;

/** "9-15, 19:30-23" → [{09:00–15:00}, {19:30–23:00}]. null se não perceber. */
export function parseSlots(text: string): Slot[] | null {
  const parts = text.split(/[,;+e]/i).map((p) => p.trim()).filter(Boolean);
  const out: Slot[] = [];
  const norm = (h: string) => {
    const m = /^(\d{1,2})(?:[:h.](\d{2}))?$/.exec(h.trim());
    if (!m) return null;
    const hh = Number(m[1]), mm = Number(m[2] ?? 0);
    return hh < 24 && mm < 60 ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : null;
  };
  for (const p of parts) {
    const [a, b] = p.split(/\s*(?:-|–|às|a)\s*/);
    const start = a && norm(a), end = b && norm(b);
    if (!start || !end || start === end) return null;
    out.push({ start, end });
  }
  return out.length <= 3 ? out : null;
}

/** Início e fim de um turno da escala (um fim menor que o início acaba no dia seguinte). */
export function slotRange(date: string, slot: Slot, timezone: string): { start: Date; end: Date } {
  const base = localMidnight(date, timezone).getTime();
  const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const s = min(slot.start), e = min(slot.end);
  return { start: new Date(base + s * 60_000), end: new Date(base + (e > s ? e : e + 24 * 60) * 60_000) };
}

export interface WeekRow {
  employeeId: string;
  date: string;
  slots: Slot[];
}

export async function getWeek(db: Db, s: Scope, monday: string): Promise<WeekRow[]> {
  return getSchedules(db, s, monday, addDays(monday, 6));
}

export async function getSchedules(db: Db, s: Scope, from: string, to: string): Promise<WeekRow[]> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const rows = await tx
      .select({ employeeId: clockSchedules.employeeId, date: clockSchedules.workDate, start: clockSchedules.startTime, end: clockSchedules.endTime })
      .from(clockSchedules)
      .where(and(eq(clockSchedules.establishmentId, s.establishmentId), gte(clockSchedules.workDate, from), lte(clockSchedules.workDate, to)))
      .orderBy(clockSchedules.workDate, clockSchedules.startTime);
    const map = new Map<string, WeekRow>();
    for (const r of rows) {
      const k = `${r.employeeId}|${r.date}`;
      const row = map.get(k) ?? { employeeId: r.employeeId, date: r.date, slots: [] };
      row.slots.push({ start: r.start, end: r.end });
      map.set(k, row);
    }
    return [...map.values()];
  });
}

/** Grava a escala da semana inteira (substitui a anterior). Mantém os avisos já enviados dos turnos que não mudaram. */
export async function saveWeek(db: Db, s: Scope, monday: string, rows: WeekRow[]): Promise<void> {
  await withTenant(db, tenantOf(s), async (tx) => {
    const sunday = addDays(monday, 6);
    const valid = await tx.select({ id: clockEmployees.id }).from(clockEmployees).where(eq(clockEmployees.establishmentId, s.establishmentId));
    const ids = new Set(valid.map((v) => v.id));
    const old = await tx
      .select()
      .from(clockSchedules)
      .where(and(eq(clockSchedules.establishmentId, s.establishmentId), gte(clockSchedules.workDate, monday), lte(clockSchedules.workDate, sunday)));
    const kept = new Map(old.map((o) => [`${o.employeeId}|${o.workDate}|${o.startTime}|${o.endTime}`, o]));
    await tx.delete(clockSchedules).where(and(eq(clockSchedules.establishmentId, s.establishmentId), gte(clockSchedules.workDate, monday), lte(clockSchedules.workDate, sunday)));
    const values = rows
      .filter((r) => ids.has(r.employeeId) && r.date >= monday && r.date <= sunday)
      .flatMap((r) =>
        r.slots.map((sl) => {
          const prev = kept.get(`${r.employeeId}|${r.date}|${sl.start}|${sl.end}`);
          return {
            organizationId: s.organizationId,
            establishmentId: s.establishmentId,
            employeeId: r.employeeId,
            workDate: r.date,
            startTime: sl.start,
            endTime: sl.end,
            lateNotifiedAt: prev?.lateNotifiedAt ?? null,
            outNotifiedAt: prev?.outNotifiedAt ?? null,
          };
        }),
      );
    if (values.length) await tx.insert(clockSchedules).values(values);
  });
}

export async function getNotify(db: Db, s: Scope): Promise<boolean> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [e] = await tx.select({ v: establishments.clockNotify }).from(establishments).where(eq(establishments.id, s.establishmentId));
    return e?.v ?? true;
  });
}

export async function setNotify(db: Db, s: Scope, on: boolean): Promise<void> {
  await withTenant(db, tenantOf(s), (tx) =>
    tx.update(establishments).set({ clockNotify: on, updatedAt: new Date() }).where(and(eq(establishments.id, s.establishmentId), eq(establishments.organizationId, s.organizationId))),
  );
}

export interface Attendance {
  employeeId: string;
  employeeName: string;
  date: string;
  start: string;
  end: string;
  /** upcoming = ainda não começou; ontime/late = chegou; absent = não picou a entrada; working = turno a decorrer sem entrada ainda dentro da tolerância. */
  status: "upcoming" | "ontime" | "late" | "absent" | "waiting";
  lateMinutes: number;
  inAt: string | null;
}

/** Compara a escala com as entradas picadas: a horas, atrasado ou não veio. */
export function attendance(week: WeekRow[], shifts: ClockShift[], names: Map<string, string>, timezone: string, now = new Date()): Attendance[] {
  const out: Attendance[] = [];
  for (const r of week) {
    for (const sl of r.slots) {
      const { start, end } = slotRange(r.date, sl, timezone);
      const ins = shifts
        .filter((sh) => sh.employeeId === r.employeeId && sh.inAt)
        .map((sh) => new Date(sh.inAt!))
        .filter((t) => t.getTime() >= start.getTime() - 3 * 3600_000 && t.getTime() <= end.getTime());
      const first = ins.sort((a, b) => a.getTime() - b.getTime())[0];
      const late = first ? Math.max(0, Math.round((first.getTime() - start.getTime()) / 60_000)) : 0;
      const status: Attendance["status"] = first
        ? late > LATE_TOLERANCE_MIN
          ? "late"
          : "ontime"
        : now < start
          ? "upcoming"
          : now.getTime() - start.getTime() > ABSENT_AFTER_MIN * 60_000
            ? "absent"
            : "waiting";
      out.push({ employeeId: r.employeeId, employeeName: names.get(r.employeeId) ?? "", date: r.date, start: sl.start, end: sl.end, status, lateMinutes: late, inAt: first?.toISOString() ?? null });
    }
  }
  return out.sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
}

/**
 * Tarefa automática (cron de cada minuto): avisa o dono no telemóvel quando alguém da escala não
 * picou a entrada 15 minutos depois da hora, ou continua sem picar a saída 45 minutos depois do fim.
 * Ligação de sistema (todos os restaurantes). Cada aviso só sai uma vez.
 */
export async function checkScheduleAlerts(systemDb: Db, now = new Date(), send?: PushSender | null): Promise<number> {
  const yesterday = new Date(now.getTime() - 36 * 3600_000).toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 36 * 3600_000).toISOString().slice(0, 10);
  const rows = await systemDb
    .select({
      id: clockSchedules.id,
      organizationId: clockSchedules.organizationId,
      establishmentId: clockSchedules.establishmentId,
      employeeId: clockSchedules.employeeId,
      name: clockEmployees.name,
      date: clockSchedules.workDate,
      start: clockSchedules.startTime,
      end: clockSchedules.endTime,
      lateNotifiedAt: clockSchedules.lateNotifiedAt,
      outNotifiedAt: clockSchedules.outNotifiedAt,
      tz: establishments.timezone,
    })
    .from(clockSchedules)
    .innerJoin(clockEmployees, eq(clockEmployees.id, clockSchedules.employeeId))
    .innerJoin(establishments, eq(establishments.id, clockSchedules.establishmentId))
    .where(
      and(
        gte(clockSchedules.workDate, yesterday),
        lte(clockSchedules.workDate, tomorrow),
        eq(establishments.clockNotify, true),
        eq(clockEmployees.active, true),
        sql`(${clockSchedules.lateNotifiedAt} is null or ${clockSchedules.outNotifiedAt} is null)`,
      ),
    );
  let sent = 0;
  for (const r of rows) {
    const { start, end } = slotRange(r.date, { start: r.start, end: r.end }, r.tz);
    const lateDue = !r.lateNotifiedAt && now.getTime() > start.getTime() + ABSENT_AFTER_MIN * 60_000 && now < end;
    const outDue = !r.outNotifiedAt && now.getTime() > end.getTime() + FORGOT_OUT_AFTER_MIN * 60_000 && now.getTime() < end.getTime() + 12 * 3600_000;
    if (!lateDue && !outDue) continue;
    const entries = await systemDb
      .select({ kind: clockEntries.kind, at: clockEntries.at })
      .from(clockEntries)
      .where(and(eq(clockEntries.employeeId, r.employeeId), isNull(clockEntries.deletedAt), gte(clockEntries.at, new Date(start.getTime() - 3 * 3600_000))))
      .orderBy(desc(clockEntries.at));
    if (lateDue) {
      const arrived = entries.some((e) => e.kind === "in" && e.at <= end);
      await systemDb.update(clockSchedules).set({ lateNotifiedAt: now }).where(eq(clockSchedules.id, r.id));
      if (!arrived) {
        sent += await notifyManagers(
          systemDb,
          r.organizationId,
          r.establishmentId,
          { title: "Picar ponto", body: `${r.name} ainda não picou a entrada (escala às ${r.start}).`, tag: `ponto-entrada-${r.id}`, url: "/painel" },
          send,
        );
      }
    }
    if (outDue) {
      const last = entries[0];
      await systemDb.update(clockSchedules).set({ outNotifiedAt: now }).where(eq(clockSchedules.id, r.id));
      if (last && last.kind !== "out") {
        sent += await notifyManagers(
          systemDb,
          r.organizationId,
          r.establishmentId,
          { title: "Picar ponto", body: `${r.name} ainda não picou a saída (escala até às ${r.end}).`, tag: `ponto-saida-${r.id}`, url: "/painel" },
          send,
        );
      }
    }
  }
  return sent;
}

