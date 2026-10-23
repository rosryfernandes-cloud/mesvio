// Lista os URLs das 10 mesas de demonstração (para gerar QR Codes de teste).
import { readFileSync } from "node:fs";

const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const src = readFileSync(new URL("../src/server/pos/mock/demo-data.ts", import.meta.url), "utf8");
const block = src.match(/TABLE_TOKENS = \[([\s\S]*?)\]/)?.[1] ?? "";
const tokens = [...block.matchAll(/"([A-Za-z0-9_-]{22})"/g)].map((m) => m[1]);

tokens.forEach((t, i) => console.log(`Mesa ${String(i + 1).padStart(2)}  ${base}/m/${t}`));
