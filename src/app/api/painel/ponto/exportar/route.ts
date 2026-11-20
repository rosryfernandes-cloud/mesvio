import { z } from "zod";
import { getDb } from "@/server/db/client";
import { establishmentTimezone, listEntries, pairShifts } from "@/server/clock/clock-service";
import { addDays, localDate, localMidnight, localTime } from "@/server/clock/clock-dates";
import { guardStaff, json } from "@/server/staff/http";

export const dynamic = "force-dynamic";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Registo de tempos de trabalho em CSV (abre no Excel), para o contabilista. */
export async function GET(request: Request) {
  const ctx = await guardStaff(request, { mutating: false, permission: "settings.edit" });
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url);
  const from = day.safeParse(url.searchParams.get("de")).data;
  const to = day.safeParse(url.searchParams.get("ate")).data;
  if (!from || !to || from > to || addDays(from, 370) < to) return json({ message: "Escolha as datas (até 1 ano)." }, 400);
  const db = await getDb();
  const tz = await establishmentTimezone(db, ctx);
  const shifts = pairShifts(await listEntries(db, ctx, localMidnight(from, tz), localMidnight(addDays(to, 1), tz))).reverse();
  const lines = ["Funcionário;Data;Entrada;Saída;Horas;Nota"];
  for (const s of shifts) {
    const ref = new Date((s.inAt ?? s.outAt)!);
    const hours = s.minutes === null ? "" : `${Math.floor(s.minutes / 60)}:${String(s.minutes % 60).padStart(2, "0")}`;
    const note = !s.inAt ? "Saída sem entrada" : !s.outAt ? "Entrada sem saída" : "";
    const [y, m, d] = localDate(ref, tz).split("-");
    lines.push([s.employeeName, `${d}/${m}/${y}`, s.inAt ? localTime(new Date(s.inAt), tz) : "", s.outAt ? localTime(new Date(s.outAt), tz) : "", hours, note].map(cell).join(";"));
  }
  // BOM para o Excel abrir os acentos certos.
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ponto-${from}-a-${to}.csv"`, "Cache-Control": "no-store" },
  });
}
