import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { queryRows, withTenant } from "@/server/db/tenant";
import { auditLogs, clockEmployees, clockEntries, establishments } from "@/server/db/schema";
import type { StaffContext } from "@/server/staff/context";
import { open as openSealed, seal } from "@/server/security/secret-box";
import { decodeSigned, encodeSigned } from "@/server/staff/session";

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

/** Assinatura de uma cara: 128 números (modelo de reconhecimento a correr no tablet). */
export const DESCRIPTOR_SCHEMA = z.array(z.number().min(-2).max(2)).length(128);
/** Distância máxima para considerar a mesma pessoa (mais baixo = mais exigente). */
export const FACE_MATCH_MAX = 0.55;
/** A segunda pessoa mais parecida tem de ficar claramente mais longe (evita confundir irmãos). */
const FACE_MARGIN = 0.06;
const TICKET_MS = 60_000;

export function faceDistance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** Quem é esta cara: o funcionário mais parecido, se estiver perto o suficiente e sem empate. */
export function bestFaceMatch(live: number[], people: { id: string; samples: number[][] }[]): { id: string; distance: number } | null {
  const scored = people
    .map((p) => ({ id: p.id, distance: Math.min(...p.samples.map((s) => faceDistance(live, s))) }))
    .sort((a, b) => a.distance - b.distance);
  const [best, second] = scored;
  if (!best || best.distance > FACE_MATCH_MAX) return null;
  if (second && second.distance - best.distance < FACE_MARGIN) return null;
  return best;
}

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

export type ClockKind = "in" | "out" | "pause" | "resume";
export type ClockState = "off" | "working" | "paused";
export const KIND_SCHEMA = z.enum(["in", "out", "pause", "resume"]);

/** Estado do funcionário pelo último registo: fora, a trabalhar ou em pausa (um turno esquecido há muito conta como fora). */
export function stateFrom(last: { kind: ClockKind; at: Date } | undefined, now = new Date()): ClockState {
  if (!last || now.getTime() - last.at.getTime() >= OPEN_SHIFT_MS || last.kind === "out") return "off";
  return last.kind === "pause" ? "paused" : "working";
}

/** O que se pode fazer em cada estado, e o que o tablet propõe primeiro. */
export const ALLOWED: Record<ClockState, ClockKind[]> = { off: ["in"], working: ["pause", "out"], paused: ["resume", "out"] };
export const DEFAULT_KIND: Record<ClockState, ClockKind> = { off: "in", working: "out", paused: "resume" };

/** O registo mais provável a seguir (entrada, saída ou regresso da pausa). */
export function nextKind(last: { kind: ClockKind; at: Date } | undefined, now = new Date()): ClockKind {
  return DEFAULT_KIND[stateFrom(last, now)];
}

// ───────────────────────── Painel (dono / gerente) ─────────────────────────

export interface ClockEmployee {
  id: string;
  name: string;
  active: boolean;
  hasFace: boolean;
}

export async function listEmployees(db: Db, s: Scope): Promise<ClockEmployee[]> {
  return withTenant(db, tenantOf(s), (tx) =>
    tx
      .select({ id: clockEmployees.id, name: clockEmployees.name, active: clockEmployees.active, hasFace: sql<boolean>`${clockEmployees.faceCiphertext} is not null` })
      .from(clockEmployees)
      .where(eq(clockEmployees.establishmentId, s.establishmentId))
      .orderBy(desc(clockEmployees.active), asc(clockEmployees.name))
      .then((rows) => rows.map((r) => ({ ...r, hasFace: Boolean(r.hasFace) }))),
  );
}

/** Guarda as assinaturas da cara de um funcionário (cifradas). `null` apaga-as. */
export async function setEmployeeFace(db: Db, s: Scope, id: string, samples: number[][] | null): Promise<boolean> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const rows = await tx
      .update(clockEmployees)
      .set(samples ? { faceCiphertext: seal(JSON.stringify(samples)), faceEnrolledAt: new Date() } : { faceCiphertext: null, faceEnrolledAt: null })
      .where(and(eq(clockEmployees.id, id), eq(clockEmployees.establishmentId, s.establishmentId)))
      .returning({ id: clockEmployees.id });
    return rows.length > 0;
  });
}

export async function getFaceEnabled(db: Db, s: Scope): Promise<boolean> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [e] = await tx.select({ on: establishments.clockFaceEnabled }).from(establishments).where(eq(establishments.id, s.establishmentId));
    return e?.on ?? false;
  });
}

/** Ligar ou desligar o reconhecimento facial. Ao desligar, apagam-se as caras de todos (dados biométricos). */
export async function setFaceEnabled(db: Db, s: Scope, enabled: boolean): Promise<void> {
  await withTenant(db, tenantOf(s), async (tx) => {
    await tx
      .update(establishments)
      .set({ clockFaceEnabled: enabled, updatedAt: new Date() })
      .where(and(eq(establishments.id, s.establishmentId), eq(establishments.organizationId, s.organizationId)));
    if (!enabled) await tx.update(clockEmployees).set({ faceCiphertext: null, faceEnrolledAt: null }).where(eq(clockEmployees.establishmentId, s.establishmentId));
  });
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
  kind: ClockKind;
  at: string;
  hasPhoto: boolean;
  source: "tablet" | "manual";
  /** Hora original antes de o dono a corrigir (null = nunca corrigida). */
  originalAt: string | null;
}

/** Turno: entrada, pausas e saída. `minutes` são as horas trabalhadas (sem as pausas). */
export interface ClockShift {
  employeeId: string;
  employeeName: string;
  inAt: string | null;
  outAt: string | null;
  minutes: number | null;
  pauseMinutes: number;
  /** closed = completo; open = a trabalhar agora; forgot = esqueceu-se de picar a saída; noIn = saída sem entrada. */
  status: "closed" | "open" | "forgot" | "noIn";
  /** Alguma hora acrescentada ou corrigida pelo dono. */
  corrected: boolean;
  entries: ClockEntryRow[];
  inEntryId: string | null;
  outEntryId: string | null;
}

const ms = (iso: string) => new Date(iso).getTime();

function closeShift(entries: ClockEntryRow[], status: ClockShift["status"]): ClockShift {
  const first = entries[0];
  const inE = entries.find((e) => e.kind === "in") ?? null;
  const outE = [...entries].reverse().find((e) => e.kind === "out") ?? null;
  let pause = 0;
  let pauseStart: number | null = null;
  for (const e of entries) {
    if (e.kind === "pause") pauseStart = ms(e.at);
    else if ((e.kind === "resume" || e.kind === "out") && pauseStart !== null) {
      pause += ms(e.at) - pauseStart;
      pauseStart = null;
    }
  }
  const minutes = status === "closed" && inE && outE ? Math.max(0, Math.round((ms(outE.at) - ms(inE.at) - pause) / 60_000)) : null;
  return {
    employeeId: first.employeeId,
    employeeName: first.employeeName,
    inAt: inE?.at ?? null,
    outAt: outE?.at ?? null,
    minutes,
    pauseMinutes: Math.round(pause / 60_000),
    status,
    corrected: entries.some((e) => e.source === "manual" || e.originalAt !== null),
    entries,
    inEntryId: inE?.id ?? null,
    outEntryId: outE?.id ?? null,
  };
}

export function pairShifts(entries: ClockEntryRow[], now = new Date()): ClockShift[] {
  const byEmp = new Map<string, ClockEntryRow[]>();
  for (const e of [...entries].sort((a, b) => a.at.localeCompare(b.at))) {
    const list = byEmp.get(e.employeeId) ?? [];
    list.push(e);
    byEmp.set(e.employeeId, list);
  }
  const shifts: ClockShift[] = [];
  for (const list of byEmp.values()) {
    let cur: ClockEntryRow[] | null = null;
    for (const e of list) {
      if (e.kind === "in") {
        if (cur) shifts.push(closeShift(cur, "forgot"));
        cur = [e];
      } else if (e.kind === "out") {
        if (cur) {
          cur.push(e);
          shifts.push(closeShift(cur, cur[0].kind === "in" ? "closed" : "noIn"));
          cur = null;
        } else shifts.push(closeShift([e], "noIn"));
      } else (cur ??= []).push(e);
    }
    if (cur) {
      const last = cur[cur.length - 1];
      shifts.push(closeShift(cur, cur[0].kind !== "in" ? "noIn" : now.getTime() - ms(last.at) < OPEN_SHIFT_MS ? "open" : "forgot"));
    }
  }
  return shifts.sort((a, b) => (b.inAt ?? b.outAt ?? b.entries[0].at).localeCompare(a.inAt ?? a.outAt ?? a.entries[0].at));
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
        source: clockEntries.source,
        originalAt: clockEntries.originalAt,
      })
      .from(clockEntries)
      .innerJoin(clockEmployees, eq(clockEmployees.id, clockEntries.employeeId))
      .where(and(eq(clockEntries.establishmentId, s.establishmentId), isNull(clockEntries.deletedAt), gte(clockEntries.at, from), lt(clockEntries.at, to)))
      .orderBy(asc(clockEntries.at));
    return rows.map((r) => ({ ...r, at: r.at.toISOString(), hasPhoto: Boolean(r.hasPhoto), originalAt: r.originalAt?.toISOString() ?? null }));
  });
}

// ───────────────────────── Correções do dono (com histórico) ─────────────────────────

const KIND_LABEL: Record<ClockKind, string> = { in: "entrada", out: "saída", pause: "pausa", resume: "regresso da pausa" };

async function audit(tx: Db, s: Scope, action: string, entityId: string, before: unknown, after: unknown) {
  await tx.insert(auditLogs).values({ organizationId: s.organizationId, actorType: "user", actorId: s.userId, action, entityType: "clock_entry", entityId, before, after });
}

/** Acrescentar um registo esquecido (ex.: a saída que ficou por picar). */
export async function addManualEntry(db: Db, s: Scope, employeeId: string, kind: ClockKind, at: Date): Promise<{ id: string } | null> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [emp] = await tx
      .select({ id: clockEmployees.id, name: clockEmployees.name })
      .from(clockEmployees)
      .where(and(eq(clockEmployees.id, employeeId), eq(clockEmployees.establishmentId, s.establishmentId)));
    if (!emp) return null;
    const [row] = await tx
      .insert(clockEntries)
      .values({ organizationId: s.organizationId, establishmentId: s.establishmentId, employeeId, kind, at, source: "manual", editedAt: new Date(), editedBy: s.userId })
      .returning({ id: clockEntries.id });
    await audit(tx, s, "clock.entry.add", row.id, null, { employee: emp.name, kind, at: at.toISOString() });
    return row;
  });
}

/** Corrigir a hora de um registo. A hora original fica guardada no próprio registo e no histórico. */
export async function editEntryTime(db: Db, s: Scope, id: string, at: Date): Promise<boolean> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [cur] = await tx
      .select({ at: clockEntries.at, originalAt: clockEntries.originalAt, kind: clockEntries.kind, name: clockEmployees.name })
      .from(clockEntries)
      .innerJoin(clockEmployees, eq(clockEmployees.id, clockEntries.employeeId))
      .where(and(eq(clockEntries.id, id), eq(clockEntries.establishmentId, s.establishmentId), isNull(clockEntries.deletedAt)));
    if (!cur) return false;
    await tx
      .update(clockEntries)
      .set({ at, originalAt: cur.originalAt ?? cur.at, editedAt: new Date(), editedBy: s.userId })
      .where(eq(clockEntries.id, id));
    await audit(tx, s, "clock.entry.edit", id, { employee: cur.name, kind: cur.kind, at: cur.at.toISOString() }, { employee: cur.name, kind: cur.kind, at: at.toISOString() });
    return true;
  });
}

/** Apagar um registo (ex.: picado por engano). Fica guardado como apagado e no histórico; deixa de contar nas horas. */
export async function deleteEntry(db: Db, s: Scope, id: string): Promise<boolean> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const [cur] = await tx
      .select({ at: clockEntries.at, kind: clockEntries.kind, name: clockEmployees.name })
      .from(clockEntries)
      .innerJoin(clockEmployees, eq(clockEmployees.id, clockEntries.employeeId))
      .where(and(eq(clockEntries.id, id), eq(clockEntries.establishmentId, s.establishmentId), isNull(clockEntries.deletedAt)));
    if (!cur) return false;
    await tx.update(clockEntries).set({ deletedAt: new Date(), editedAt: new Date(), editedBy: s.userId }).where(eq(clockEntries.id, id));
    await audit(tx, s, "clock.entry.delete", id, { employee: cur.name, kind: cur.kind, at: cur.at.toISOString() }, null);
    return true;
  });
}

export interface ClockCorrection {
  at: string;
  action: "add" | "edit" | "delete";
  text: string;
}

/** Histórico das correções (as mais recentes primeiro), em frases para o dono e para uma inspeção. */
export async function listCorrections(db: Db, s: Scope, timezone: string, limit = 50): Promise<ClockCorrection[]> {
  return withTenant(db, tenantOf(s), async (tx) => {
    const ids = tx.select({ id: sql<string>`${clockEntries.id}::text` }).from(clockEntries).where(eq(clockEntries.establishmentId, s.establishmentId));
    const rows = await tx
      .select({ action: auditLogs.action, before: auditLogs.before, after: auditLogs.after, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, "clock_entry"), inArray(auditLogs.entityId, ids)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
    const when = (iso: string) => new Date(iso).toLocaleString("pt-PT", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return rows.map((r) => {
      const b = r.before as { employee: string; kind: ClockKind; at: string } | null;
      const a = r.after as { employee: string; kind: ClockKind; at: string } | null;
      const action = r.action.endsWith("add") ? "add" : r.action.endsWith("edit") ? "edit" : "delete";
      const text =
        action === "add" && a
          ? `Acrescentada a ${KIND_LABEL[a.kind]} de ${a.employee} (${when(a.at)})`
          : action === "edit" && a && b
            ? `${KIND_LABEL[a.kind][0].toUpperCase()}${KIND_LABEL[a.kind].slice(1)} de ${a.employee} mudada de ${when(b.at)} para ${when(a.at)}`
            : b
              ? `Apagada a ${KIND_LABEL[b.kind]} de ${b.employee} (${when(b.at)})`
              : "Correção";
      return { at: r.createdAt.toISOString(), action, text };
    });
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
  /** Há reconhecimento facial ligado e pelo menos uma cara registada. */
  face: boolean;
  employees: { id: string; name: string; state: ClockState; next: ClockKind }[];
}

export async function kioskView(db: Db, token: string, now = new Date()): Promise<KioskView | null> {
  const ids = await resolveKiosk(db, token);
  if (!ids) return null;
  return withTenant(db, { organizationId: ids.organizationId }, async (tx) => {
    const [e] = await tx.select({ name: establishments.name, face: establishments.clockFaceEnabled }).from(establishments).where(eq(establishments.id, ids.establishmentId));
    const emps = await tx
      .select({ id: clockEmployees.id, name: clockEmployees.name, hasFace: sql<boolean>`${clockEmployees.faceCiphertext} is not null` })
      .from(clockEmployees)
      .where(and(eq(clockEmployees.establishmentId, ids.establishmentId), eq(clockEmployees.active, true)))
      .orderBy(asc(clockEmployees.name));
    const since = new Date(now.getTime() - OPEN_SHIFT_MS);
    const recent = await tx
      .select({ employeeId: clockEntries.employeeId, kind: clockEntries.kind, at: clockEntries.at })
      .from(clockEntries)
      .where(and(eq(clockEntries.establishmentId, ids.establishmentId), isNull(clockEntries.deletedAt), gte(clockEntries.at, since)))
      .orderBy(desc(clockEntries.at));
    const last = new Map<string, { kind: ClockKind; at: Date }>();
    for (const r of recent) if (!last.has(r.employeeId)) last.set(r.employeeId, { kind: r.kind, at: r.at });
    return {
      establishmentName: e?.name ?? "",
      face: Boolean(e?.face) && emps.some((x) => x.hasFace),
      employees: emps.map((x) => {
        const state = stateFrom(last.get(x.id), now);
        return { id: x.id, name: x.name, state, next: DEFAULT_KIND[state] };
      }),
    };
  });
}

export type PunchResult =
  | { ok: true; kind: ClockKind; at: string; name: string }
  | { ok: false; code: "NOT_FOUND" | "WRONG_PIN" | "NOT_ALLOWED"; message: string };

export type FaceResult =
  | { ok: true; employeeId: string; name: string; state: ClockState; next: ClockKind; ticket: string }
  | { ok: false; code: "NOT_FOUND" | "OFF" | "NO_MATCH"; message: string };

/**
 * Reconhecimento facial: o tablet calcula a assinatura da cara e o servidor compara-a com as
 * guardadas (as caras dos colegas nunca saem do servidor). Devolve quem é e um bilhete de 1 minuto
 * para confirmar ("É o Rodrigo?") sem PIN.
 */
export async function identifyFace(db: Db, token: string, live: number[], now = new Date()): Promise<FaceResult> {
  const ids = await resolveKiosk(db, token);
  if (!ids) return { ok: false, code: "NOT_FOUND", message: "Este link de picar ponto já não é válido." };
  return withTenant(db, { organizationId: ids.organizationId }, async (tx) => {
    const [e] = await tx.select({ face: establishments.clockFaceEnabled }).from(establishments).where(eq(establishments.id, ids.establishmentId));
    if (!e?.face) return { ok: false as const, code: "OFF" as const, message: "O reconhecimento facial está desligado. Use o nome e o PIN." };
    const rows = await tx
      .select({ id: clockEmployees.id, name: clockEmployees.name, face: clockEmployees.faceCiphertext })
      .from(clockEmployees)
      .where(and(eq(clockEmployees.establishmentId, ids.establishmentId), eq(clockEmployees.active, true)));
    const people = rows.flatMap((r) => {
      if (!r.face) return [];
      try {
        return [{ id: r.id, samples: JSON.parse(openSealed(r.face)) as number[][] }];
      } catch {
        return [];
      }
    });
    const match = bestFaceMatch(live, people);
    if (!match) return { ok: false as const, code: "NO_MATCH" as const, message: "Não o reconheci. Tente outra vez com mais luz, ou toque no seu nome e use o PIN." };
    const emp = rows.find((r) => r.id === match.id)!;
    const [last] = await tx
      .select({ kind: clockEntries.kind, at: clockEntries.at })
      .from(clockEntries)
      .where(and(eq(clockEntries.employeeId, emp.id), isNull(clockEntries.deletedAt)))
      .orderBy(desc(clockEntries.at))
      .limit(1);
    const state = stateFrom(last, now);
    const ticket = encodeSigned({ k: "ponto-cara", e: emp.id, t: token.slice(0, 12) }, now.getTime() + TICKET_MS);
    return { ok: true as const, employeeId: emp.id, name: emp.name, state, next: DEFAULT_KIND[state], ticket };
  });
}

/** Confirma o registo com o bilhete do reconhecimento facial (em vez do PIN). */
export async function punchWithTicket(db: Db, token: string, ticket: string, photo: Buffer | null, action?: ClockKind, now = new Date()): Promise<PunchResult> {
  const data = decodeSigned(ticket, now.getTime());
  if (!data || data.k !== "ponto-cara" || data.t !== token.slice(0, 12) || typeof data.e !== "string") {
    return { ok: false, code: "WRONG_PIN", message: "O reconhecimento expirou. Tente outra vez." };
  }
  return punchEmployee(db, token, data.e, null, photo, action, now);
}

/** Regista entrada, pausa, regresso ou saída (sem `action`, o mais provável) se o PIN estiver certo. */
export async function punch(db: Db, token: string, employeeId: string, pin: string, photo: Buffer | null, action?: ClockKind, now = new Date()): Promise<PunchResult> {
  return punchEmployee(db, token, employeeId, pin, photo, action, now);
}

/** `pin` null = já identificado pela cara (bilhete válido). */
async function punchEmployee(db: Db, token: string, employeeId: string, pin: string | null, photo: Buffer | null, action: ClockKind | undefined, now: Date): Promise<PunchResult> {
  const ids = await resolveKiosk(db, token);
  if (!ids) return { ok: false, code: "NOT_FOUND", message: "Este link de picar ponto já não é válido. Peça um novo ao responsável." };
  return withTenant(db, { organizationId: ids.organizationId }, async (tx) => {
    const [emp] = await tx
      .select({ id: clockEmployees.id, name: clockEmployees.name, pinHash: clockEmployees.pinHash })
      .from(clockEmployees)
      .where(and(eq(clockEmployees.id, employeeId), eq(clockEmployees.establishmentId, ids.establishmentId), eq(clockEmployees.active, true)));
    if (!emp) return { ok: false as const, code: "NOT_FOUND" as const, message: "Funcionário não encontrado." };
    if (pin !== null && !checkPin(pin, emp.pinHash)) return { ok: false as const, code: "WRONG_PIN" as const, message: "PIN errado. Tente de novo." };
    const [last] = await tx
      .select({ kind: clockEntries.kind, at: clockEntries.at })
      .from(clockEntries)
      .where(and(eq(clockEntries.employeeId, emp.id), isNull(clockEntries.deletedAt)))
      .orderBy(desc(clockEntries.at))
      .limit(1);
    const state = stateFrom(last, now);
    // O mesmo registo duas vezes seguidas em menos de 1 minuto (cara reconhecida outra vez): não se repete.
    if (last && last.kind === (action ?? DEFAULT_KIND[state]) && now.getTime() - last.at.getTime() < 60_000) return { ok: true as const, kind: last.kind, at: last.at.toISOString(), name: emp.name };
    const kind = action ?? DEFAULT_KIND[state];
    if (!ALLOWED[state].includes(kind)) {
      const msg = state === "off" ? "Ainda não registou a entrada hoje." : state === "paused" ? "Está em pausa: registe o regresso ou a saída." : "Já registou a entrada.";
      return { ok: false as const, code: "NOT_ALLOWED" as const, message: msg };
    }
    await tx.insert(clockEntries).values({ organizationId: ids.organizationId, establishmentId: ids.establishmentId, employeeId: emp.id, kind, at: now, photo });
    return { ok: true as const, kind, at: now.toISOString(), name: emp.name };
  });
}
