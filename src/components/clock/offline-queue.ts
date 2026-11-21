"use client";

/**
 * Picar ponto sem internet: o registo fica guardado no tablet (com a hora real) e é enviado quando a
 * ligação voltar. Também se guarda a última lista de funcionários, para o tablet abrir mesmo offline.
 * Só o nome + PIN funciona offline (a cara precisa do servidor para saber quem é).
 */

type Kind = "in" | "out" | "pause" | "resume";
export type QueuedPunch = { id: string; employeeId: string; name: string; pin: string; action: Kind; at: string; photo?: string };

const qKey = (token: string) => `mesvio-ponto-fila:${token.slice(0, 24)}`;
const vKey = (token: string) => `mesvio-ponto-vista:${token.slice(0, 24)}`;
/** Com muitos registos por enviar, deixa de guardar fotos (o armazenamento do browser é pequeno). */
const MAX_WITH_PHOTO = 25;

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Armazenamento cheio ou bloqueado: o registo fica só em memória até a página fechar.
  }
}

export const queued = (token: string): QueuedPunch[] => read<QueuedPunch[]>(qKey(token), []);

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

export async function enqueue(token: string, p: Omit<QueuedPunch, "id" | "photo">, photo: Blob | null): Promise<number> {
  const list = queued(token);
  const item: QueuedPunch = { ...p, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  if (photo && list.length < MAX_WITH_PHOTO) item.photo = await blobToDataUrl(photo).catch(() => undefined);
  list.push(item);
  write(qKey(token), list);
  return list.length;
}

/** Envia o que estiver guardado, do mais antigo para o mais recente. Para no primeiro erro de rede. */
export async function flush(token: string): Promise<{ sent: number; refused: string[]; remaining: number }> {
  let list = queued(token);
  let sent = 0;
  const refused: string[] = [];
  while (list.length > 0) {
    const p = list[0];
    const form = new FormData();
    form.append("employeeId", p.employeeId);
    form.append("pin", p.pin);
    form.append("action", p.action);
    form.append("at", p.at);
    if (p.photo) {
      const blob = await fetch(p.photo).then((r) => r.blob()).catch(() => null);
      if (blob) form.append("photo", blob, "ponto.jpg");
    }
    const res = await fetch(`/api/ponto/${token}`, { method: "POST", body: form }).catch(() => null);
    if (!res || res.status >= 500 || res.status === 429) break; // ainda sem ligação (ou o servidor ocupado): tenta mais tarde
    if (res.ok) sent++;
    else refused.push(p.name);
    list = list.slice(1);
    write(qKey(token), list);
  }
  return { sent, refused, remaining: list.length };
}

export function saveView<T>(token: string, view: T) {
  write(vKey(token), view);
}
export function cachedView<T>(token: string): T | null {
  return read<T | null>(vKey(token), null);
}
