/**
 * Lista de restaurantes colada na Central (CSV/folha de cálculo, com ou sem cabeçalho) → nome, link
 * da ementa e email. Aceita ";", "," ou tabulação, e campos entre aspas.
 */
export type ProspectRow = { name: string; url: string; email: string };

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const looksLikeUrl = (v: string) => /^(https?:\/\/|www\.)\S+$/i.test(v) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v);
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function parseProspects(text: string): ProspectRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const first = splitLine(lines[0], sep).map((h) => h.toLowerCase());
  const header = first.some((h) => /^(nome|name|restaurante)$/.test(h)) || first.some((h) => /link|url|ementa/.test(h));
  const find = (re: RegExp) => first.findIndex((h) => re.test(h));
  const nameAt = header ? Math.max(0, find(/^(nome|name|restaurante)$/)) : 0;
  const urlAt = header ? find(/link_ementa|^link|ementa|url/) : 1;
  const emailAt = header ? find(/e-?mail/) : 2;
  const rows: ProspectRow[] = [];
  for (const line of header ? lines.slice(1) : lines) {
    const cols = splitLine(line, sep);
    const name = cols[nameAt] ?? "";
    // O primeiro email da célula (pode ter vários separados por "/" ou ",").
    const email = (cols[emailAt] ?? "").split(/[\s/,;]+/).find(looksLikeEmail) ?? "";
    let url = (cols[urlAt] ?? "").split(/\s+/)[0] ?? "";
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/\//, "")}`;
    if (name && url && looksLikeUrl(url.replace(/^https?:\/\//i, ""))) rows.push({ name: name.slice(0, 120), url, email });
  }
  return rows;
}
