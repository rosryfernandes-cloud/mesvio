import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { queryRows, withTenant } from "@/server/db/tenant";
import { clockEmployees, clockEntries, establishments } from "@/server/db/schema";
import type { StaffContext } from "@/server/staff/context";

/**
 * Picar ponto: o tablet à entrada abre /ponto/<token>; o funcionário toca no nome, mete o PIN e o
 * tablet tira uma selfie como prova. Não há reconhecimento facial (a foto não é analisada), por isso
 * não há tratamento de dados biométricos. O dono vê no painel quem entrou e saiu, as horas e exporta.
 */

type Scope = Pick<StaffContext, "userId" | "organizationId" | "establishmentId">;
const tenantOf = (s: Scope) => ({ organizationId: s.organizationId, userId: s.userId });

export const PIN_SCHEMA = z.string().regex(/^\d{4}$/, "O PIN tem 4 algarismos.");
export const NAME_SCHEMA = z.string().trim().min(1).max(60);
/** Uma selfie reduzida no tablet fica bem abaixo disto. */
export const MAX_CLOCK_PHOTO_BYTES = 300 * 1024;
/** Uma entrada sem saída há mais do que isto já não conta como "a trabalhar" (esqueceu-se de picar). */
const OPEN_SHIFT_MS = 16 * 3600_000;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function checkPin(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const got = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Entrada ou saída: a seguir a uma entrada recente vem uma saída; senão é entrada. */
export function nextKind(last: { kind: "in" | "out"; at: Date } | undefined, now = new Date()): "in" | "out" {
  return last?.kind === "in" && now.getTime() - last.at.getTime() < OPEN_SHIFT_MS ? "out" : "in";
}

// ───────────────────────── Painel (dono / gerente) ─────────────────────────

export interface ClockEmployee {
  id: string;
  name: string;
  active: boolean;
}

export async function listEmployees(db: Db, s: Scope): Promise<ClockEmployee[]> {
  return withTenant(db, tenantOf(s), (tx) =>
    tx
      .select({ id: clockEmployees.id, name: clockEmployees.name, active: clockEmployees.active })
      .from(clockEmployees)
      .where(eq(clockEmployees.establishmentId, s.establishmentId))
      .orderBy(desc(clockEmployees.active), asc(clockEmployees.name)),
  );
}

export async function addEmployee(db: Db, s: Scope, name: string, pin: string): Promise<{ id: string }> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [row] = await tx
      .insert(clockEmployees)
      .values({ organizationId: s.organizationId, establishmentId: s.establishmentId, name: name.trim(), pinHash: hashPin(pin) })
      .returning({ id: clockEmployees.id });
    return row;
  });
}

export async function updateEmployee(db: Db, s: Scope, id: string, patch: { name?: string; pin?: string; active?: boolean }): Promise<boolean> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const set: Partial<typeof clockEmployees.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name.trim();
    if (patch.pin !== undefined) set.pinHash = hashPin(patch.pin);
    if (patch.active !== undefined) set.active = patch.active;
    if (Object.keys(set).length === 0) return true;
    const rows = await tx
      .update(clockEmployees)
      .set(set)
      .where(and(eq(clockEmployees.id, id), eq(clockEmployees.establishmentId, s.establishmentId)))
      .returning({ id: clockEmployees.id });
    return rows.length > 0;
  });
}

/** O link do tablet (cria-o na primeira vez). `regenerate` troca-o: o link antigo deixa de funcionar. */
export async function kioskToken(db: Db, s: Scope, regenerate = false): Promise<string> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [e] = await tx.select({ token: establishments.clockKioskToken }).from(establishments).where(eq(establishments.id, s.establishmentId));
    if (e?.token && !regenerate) return e.token;
    const token = randomBytes(18).toString("base64url");
    await tx
      .update(establishments)
      .set({ clockKioskToken: token, updatedAt: new Date() })
      .where(and(eq(establishments.id, s.establishmentId), eq(establishments.organizationId, s.organizationId)));
    return token;
  });
}

export interface ClockEntryRow {
  id: string;
  employeeId: string;
  employeeName: string;
  kind: "in" | "out";
  at: string;
  hasPhoto: boolean;
}

/** Turnos: cada entrada com a saída seguinte do mesmo funcionário. */
export interface ClockShift {
  employeeId: string;
  employeeName: string;
  inAt: string | null;
  outAt: string | null;
  minutes: number | null;
  inEntryId: string | null;
  outEntryId: string | null;
}

export function pairShifts(entries: ClockEntryRow[]): ClockShift[] {
  const byEmp = new Map<string, ClockEntryRow[]>();
  for (const e of [...entries].sort((a, b) => a.at.localeCompare(b.at))) {
    const list = byEmp.get(e.employeeId) ?? [];
    list.push(e);
    byEmp.set(e.employeeId, list);
  }
  const shifts: ClockShift[] = [];
  for (const list of byEmp.values()) {
    let open: ClockEntryRow | null = null;
    for (const e of list) {
      if (e.kind === "in") {
        if (open) shifts.push({ employeeId: open.employeeId, employeeName: open.employeeName, inAt: open.at, outAt: null, minutes: null, inEntryId: open.id, outEntryId: null });
        open = e;
      } else if (open) {
        const minutes = Math.round((new Date(e.at).getTime() - new Date(open.at).getTime()) / 60_000);
        shifts.push({ employeeId: e.employeeId, employeeName: e.employeeName, inAt: open.at, outAt: e.at, minutes, inEntryId: open.id, outEntryId: e.id });
        open = null;
      } else {
        // Saída sem entrada (esqueceu-se de picar à chegada).
        shifts.push({ employeeId: e.employeeId, employeeName: e.employeeName, inAt: null, outAt: e.at, minutes: null, inEntryId: null, outEntryId: e.id });
      }
    }
    // Entrada sem saída: a trabalhar agora (ou esqueceu-se de picar à saída).
    if (open) shifts.push({ employeeId: open.employeeId, employeeName: open.employeeName, inAt: open.at, outAt: null, minutes: null, inEntryId: open.id, outEntryId: null });
  }
  return shifts.sort((a, b) => (b.inAt ?? b.outAt ?? "").localeCompare(a.inAt ?? a.outAt ?? ""));
}

export async function listEntries(db: Db, s: Scope, from: Date, to: Date): Promise<ClockEntryRow[]> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const rows = await tx
      .select({
        id: clockEntries.id,
        employeeId: clockEntries.employeeId,
        employeeName: clockEmployees.name,
        kind: clockEntries.kind,
        at: clockEntries.at,
        hasPhoto: sql<boolean>`${clockEntries.photo} is not null`,
      })
      .from(clockEntries)
      .innerJoin(clockEmployees, eq(clockEmployees.id, clockEntries.employeeId))
      .where(and(eq(clockEntries.establishmentId, s.establishmentId), gte(clockEntries.at, from), lt(clockEntries.at, to)))
      .orderBy(asc(clockEntries.at));
    return rows.map((r) => ({ ...r, at: r.at.toISOString(), hasPhoto: Boolean(r.hasPhoto) }));
  });
}

export async function entryPhoto(db: Db, s: Scope, id: string): Promise<Buffer | null> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [r] = await tx
      .select({ photo: clockEntries.photo })
      .from(clockEntries)
      .where(and(eq(clockEntries.id, id), eq(clockEntries.establishmentId, s.establishmentId)));
    return r?.photo ?? null;
  });
}

export async function establishmentTimezone(db: Db, s: Scope): Promise<string> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [e] = await tx.select({ tz: establishments.timezone }).from(establishments).where(eq(establishments.id, s.establishmentId));
    return e?.tz ?? "Europe/Lisbon";
  });
}

// ───────────────────────── Tablet (público, pelo token) ─────────────────────────

async function resolveKiosk(db: Db, token: string): Promise<{ organizationId: string; establishmentId: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const [row] = await queryRows<{ organization_id: string; establishment_id: string }>(
    db,
    sql`select organization_id, establishment_id from app.resolve_clock_kiosk(${token})`,
  );
  return row ? { organizationId: row.organization_id, establishmentId: row.establishment_id } : null;
}

export interface KioskView {
  establishmentName: string;
  employees: { id: string; name: string; next: "in" | "out" }[];
}

export async function kioskView(db: Db, token: string, now = new Date()): Promise<KioskView | null> {
  const ids = await resolveKiosk(db, token);
  if (!ids) return null;
  return withTenant(db, { organizationId: ids.organizationId }, async (tx) => {
    const [e] = await tx.select({ name: establishments.name }).from(establishments).where(eq(establishments.id, ids.establishmentId));
    const emps = await tx
      .select({ id: clockEmployees.id, name: clockEmployees.name })
      .from(clockEmployees)
      .where(and(eq(clockEmployees.establishmentId, ids.establishmentId), eq(clockEmployees.active, true)))
      .orderBy(asc(clockEmployees.name));
    const since = new Date(now.getTime() - OPEN_SHIFT_MS);
    const recent = await tx
      .select({ employeeId: clockEntries.employeeId, kind: clockEntries.kind, at: clockEntries.at })
      .from(clockEntries)
      .where(and(eq(clockEntries.establishmentId, ids.establishmentId), gte(clockEntries.at, since)))
      .orderBy(desc(clockEntries.at));
    const last = new Map<string, { kind: "in" | "out"; at: Date }>();
    for (const r of recent) if (!last.has(r.employeeId)) last.set(r.employeeId, { kind: r.kind, at: r.at });
    return { establishmentName: e?.name ?? "", employees: emps.map((x) => ({ ...x, next: nextKind(last.get(x.id), now) })) };
  });
}

export type PunchResult =
  | { ok: true; kind: "in" | "out"; at: string; name: string }
  | { ok: false; code: "NOT_FOUND" | "WRONG_PIN"; message: string };

/** Regista a entrada ou a saída (decide sozinho qual) se o PIN estiver certo. */
export async function punch(db: Db, token: string, employeeId: string, pin: string, photo: Buffer | null, now = new Date()): Promise<PunchResult> {
  const ids = await resolveKiosk(db, token);
  if (!ids) return { ok: false, code: "NOT_FOUND", message: "Este link de picar ponto já não é válido. Peça um novo ao responsável." };
  return withTenant(db, { organizationId: ids.organizationId }, async (tx) => {
    const [emp] = await tx
      .select({ id: clockEmployees.id, name: clockEmployees.name, pinHash: clockEmployees.pinHash })
      .from(clockEmployees)
      .where(and(eq(clockEmployees.id, employeeId), eq(clockEmployees.establishmentId, ids.establishmentId), eq(clockEmployees.active, true)));
    if (!emp) return { ok: false as const, code: "NOT_FOUND" as const, message: "Funcionário não encontrado." };
    if (!checkPin(pin, emp.pinHash)) return { ok: false as const, code: "WRONG_PIN" as const, message: "PIN errado. Tente de novo." };
    const [last] = await tx
      .select({ kind: clockEntries.kind, at: clockEntries.at })
      .from(clockEntries)
      .where(eq(clockEntries.employeeId, emp.id))
      .orderBy(desc(clockEntries.at))
      .limit(1);
    const kind = nextKind(last, now);
    await tx.insert(clockEntries).values({ organizationId: ids.organizationId, establishmentId: ids.establishmentId, employeeId: emp.id, kind, at: now, photo });
    return { ok: true as const, kind, at: now.toISOString(), name: emp.name };
  });
}
