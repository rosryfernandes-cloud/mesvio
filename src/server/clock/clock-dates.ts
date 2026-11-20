/** Datas do picar ponto no fuso do restaurante (sem bibliotecas). */

/** Diferença (ms) entre a hora local no fuso e UTC, num dado instante. */
function offsetMs(instant: number, timezone: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instant));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - instant;
}

/** Instante UTC da meia-noite local de AAAA-MM-DD. */
export function localMidnight(date: string, timezone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return new Date(guess - offsetMs(guess - offsetMs(guess, timezone), timezone));
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function localDate(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

export function localTime(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("pt-PT", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
}
