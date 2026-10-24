// Locução das campanhas v2 (ElevenLabs, com tempos palavra a palavra para as legendas).
//
//   npm run voz:campanhas                     → as duas campanhas com as vozes Carlos e Maria
//   npm run voz:campanhas -- --so=praia/carlos → só uma combinação
//
// Escreve public/audio/campanhas/<campanha>/<voz>/<cena>.wav e src/v2/timings.json (duração de
// cada fala e o início/fim de cada palavra). Lê ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID (Maria) do .env.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const { CAMPAIGNS, SCENE_ORDER } = await import("../src/v2/campaigns.ts");

try {
  process.loadEnvFile(".env");
} catch {
  console.error("✗ Falta o ficheiro .env (copie .env.example para .env e preencha).");
  process.exit(1);
}
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("✗ Falta ELEVENLABS_API_KEY no .env.");
  process.exit(1);
}
const VOICES = {
  carlos: "yLNlwWeETM7NDHPI4qEL",
  maria: process.env.ELEVENLABS_VOICE_ID,
};
// As mesmas definições para as duas vozes (natural, sem exagero); a Maria é mais pausada, por
// isso lê um pouco mais depressa para as duas versões terem o mesmo ritmo.
const SETTINGS = { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true };
const SPEED = { carlos: 1.05, maria: 1.12 };

const only = process.argv.find((a) => a.startsWith("--so="))?.split("=")[1];
const TIMINGS = "src/v2/timings.json";
const timings = existsSync(TIMINGS) ? JSON.parse(readFileSync(TIMINGS, "utf8")) : {};

/** Junta os caracteres alinhados em palavras com início e fim (segundos). */
function words(alignment) {
  const out = [];
  let cur = null;
  alignment.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { w: "", start: alignment.character_start_times_seconds[i], end: 0 };
    cur.w += ch;
    cur.end = alignment.character_end_times_seconds[i];
  });
  if (cur) out.push(cur);
  return out.map((x) => ({ w: x.w, start: +x.start.toFixed(3), end: +x.end.toFixed(3) }));
}

for (const campaign of Object.values(CAMPAIGNS)) {
  for (const [voice, voiceId] of Object.entries(VOICES)) {
    if (only && only !== `${campaign.id}/${voice}`) continue;
    if (!voiceId) {
      console.error(`✗ Falta o Voice ID da voz ${voice}.`);
      process.exit(1);
    }
    const dir = `public/audio/campanhas/${campaign.id}/${voice}`;
    mkdirSync(dir, { recursive: true });
    timings[campaign.id] ??= {};
    timings[campaign.id][voice] = {};
    for (let i = 0; i < SCENE_ORDER.length; i++) {
      const scene = SCENE_ORDER[i];
      const text = campaign.lines[scene];
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          // Frases vizinhas: a entoação fica contínua, como uma só leitura.
          previous_text: campaign.lines[SCENE_ORDER[i - 1]],
          next_text: campaign.lines[SCENE_ORDER[i + 1]],
          voice_settings: { ...SETTINGS, speed: SPEED[voice] },
        }),
      });
      if (!res.ok) {
        console.error(`✗ ${campaign.id}/${voice}/${scene}: ${res.status} ${await res.text()}`);
        process.exit(1);
      }
      const data = await res.json();
      const tmp = `${dir}/_tmp.mp3`;
      writeFileSync(tmp, Buffer.from(data.audio_base64, "base64"));
      execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@44100", tmp, `${dir}/${scene}.wav`]);
      rmSync(tmp);
      const duration = Number(execFileSync("afinfo", [`${dir}/${scene}.wav`]).toString().match(/estimated duration: ([\d.]+)/)[1]);
      timings[campaign.id][voice][scene] = { duration: +duration.toFixed(3), words: words(data.alignment) };
      console.log(`${campaign.id.padEnd(11)} ${voice.padEnd(6)} ${scene.padEnd(7)} ${duration.toFixed(2)} s  ${text}`);
    }
  }
}
writeFileSync(TIMINGS, JSON.stringify(timings, null, 1) + "\n");
console.log(`✓ ${TIMINGS}`);
