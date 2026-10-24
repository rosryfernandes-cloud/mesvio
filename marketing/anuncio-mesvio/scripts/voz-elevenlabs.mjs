// Locução do anúncio com a ElevenLabs (voz de IA natural) → public/audio/voz/<cena>.wav
//
//   npm run voz:listar   → mostra as vozes da sua conta (nome, sotaque, Voice ID)
//   npm run voz:ia       → gera as 8 falas com a voz de ELEVENLABS_VOICE_ID e diz se cabem nas cenas
//
// Lê ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID do ficheiro .env desta pasta.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

try {
  process.loadEnvFile(".env");
} catch {
  console.error("✗ Falta o ficheiro .env (copie .env.example para .env e preencha).");
  process.exit(1);
}
const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID;
if (!KEY) {
  console.error("✗ Falta ELEVENLABS_API_KEY no .env.");
  process.exit(1);
}
const api = (path, init = {}) =>
  fetch(`https://api.elevenlabs.io${path}`, { ...init, headers: { "xi-api-key": KEY, "Content-Type": "application/json", ...init.headers } });

if (process.argv.includes("--listar")) {
  const res = await api("/v1/voices");
  if (!res.ok) {
    console.error("✗ A ElevenLabs recusou a chave:", res.status, await res.text());
    process.exit(1);
  }
  const { voices } = await res.json();
  for (const v of voices) {
    const l = v.labels ?? {};
    console.log(`${v.voice_id}  ${v.name.padEnd(28)} ${[l.language, l.accent, l.gender, l.age, l.descriptive ?? l.description].filter(Boolean).join(" · ")}`);
  }
  process.exit(0);
}
if (!VOICE) {
  console.error("✗ Falta ELEVENLABS_VOICE_ID no .env (npm run voz:listar mostra os ids).");
  process.exit(1);
}

// As falas, pela ordem do anúncio, e o tempo máximo de cada uma (duração da cena menos o atraso
// de entrada em src/Soundtrack.tsx e uma pequena folga).
const LINES = [
  ["full", "Sábado. Duas da tarde. Casa cheia.", 3.6],
  ["chaos", "Os clientes querem pedir… e a equipa não chega a todo o lado.", 3.7],
  ["turn", "E se ninguém tivesse de esperar para pedir?", 2.0],
  ["tap", "O cliente aproxima o telemóvel, ou lê o QR Code…", 3.5],
  ["order", "…escolhe e pede. Em segundos.", 4.1],
  ["send", "O pedido segue para o sistema do restaurante.", 3.6],
  ["calm", "Menos espera. Mais serviço.", 2.7],
  ["end", "O empregado que não sabias que precisavas.", 2.7],
];

mkdirSync("public/audio/voz", { recursive: true });
const tmp = "public/audio/voz/_tmp.mp3";
let tooLong = 0;
for (let i = 0; i < LINES.length; i++) {
  const [id, text, max] = LINES[i];
  const res = await api(`/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: "POST",
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      // Frases vizinhas: a entoação fica contínua, como uma só leitura.
      previous_text: LINES[i - 1]?.[1],
      next_text: LINES[i + 1]?.[1],
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  });
  if (!res.ok) {
    console.error(`✗ ${id}: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  // MP3 → WAV (mesmo formato e nome que o Remotion já usa).
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@44100", tmp, `public/audio/voz/${id}.wav`]);
  const info = execFileSync("afinfo", [`public/audio/voz/${id}.wav`]).toString();
  const secs = Number(info.match(/estimated duration: ([\d.]+)/)?.[1] ?? 0);
  const ok = secs <= max;
  if (!ok) tooLong++;
  console.log(`${ok ? "✓" : "⚠"} ${id.padEnd(6)} ${secs.toFixed(2)} s (máx. ${max} s)  ${text}`);
}
rmSync(tmp, { force: true });
console.log(
  tooLong
    ? `\n⚠ ${tooLong} fala(s) mais longa(s) do que a cena: escolha uma voz mais rápida ou encurte o texto em scripts/voz-elevenlabs.mjs.`
    : "\nTodas as falas cabem. Agora: npm run render:som",
);
