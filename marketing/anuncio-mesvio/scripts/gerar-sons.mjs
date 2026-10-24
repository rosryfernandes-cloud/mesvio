// Gera os efeitos sonoros e o fundo musical PROVISÓRIOS do anúncio, sintetizados em código
// (sem direitos de terceiros). Uso: node scripts/gerar-sons.mjs → public/audio/sfx/*.wav
// A voz provisória é gerada à parte com a voz "Joana" do macOS (ver GUIAO.md).
import { mkdirSync, writeFileSync } from "node:fs";

const SR = 44100;
const out = "public/audio/sfx";
mkdirSync(out, { recursive: true });

function wav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0.98 ? 0.98 / peak : 1;
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  writeFileSync(`${out}/${name}.wav`, Buffer.concat([h, data]));
  console.log("✓", name, (samples.length / SR).toFixed(2) + "s");
}

const N = (sec) => Math.round(sec * SR);
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
// ruído determinístico (sempre o mesmo som)
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// Ondas do mar: ruído castanho filtrado com ondulação lenta (8 s, em loop).
{
  const n = N(8);
  const s = new Array(n);
  let brown = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    brown = (brown + 0.02 * rnd()) / 1.02;
    lp += 0.05 * (brown - lp);
    const t = i / SR;
    const swell = 0.55 + 0.45 * Math.sin((2 * Math.PI * t) / 4 - Math.PI / 2);
    // fade nas pontas para o loop não estalar
    const edge = Math.min(1, t / 0.3, (8 - t) / 0.3);
    s[i] = lp * 6 * swell * edge;
  }
  wav("ondas", s);
}

// Tique de relógio.
wav(
  "tique",
  Array.from({ length: N(0.06) }, (_, i) => {
    const t = i / SR;
    return Math.sin(2 * Math.PI * 2200 * t) * Math.exp(-t / 0.008) * 0.6 + rnd() * Math.exp(-t / 0.003) * 0.3;
  }),
);

// Impacto da viragem: batida grave descendente + sopro.
wav(
  "impacto",
  Array.from({ length: N(1.2) }, (_, i) => {
    const t = i / SR;
    const f = 90 * Math.exp(-t * 2.5) + 38;
    return Math.sin(2 * Math.PI * f * t) * env(t, 0.005, 0.35) + rnd() * env(t, 0.002, 0.08) * 0.25;
  }),
);

// Brilho do varrimento verde: subida suave com harmónicos.
wav(
  "brilho",
  Array.from({ length: N(1.4) }, (_, i) => {
    const t = i / SR;
    const f = 520 * Math.pow(2, t * 1.4);
    const a = Math.sin(Math.PI * Math.min(1, t / 1.4)) * 0.35;
    return a * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.01 * t) + 0.2 * Math.sin(2 * Math.PI * f * 3.02 * t));
  }),
);

// "Ping" do toque NFC.
wav(
  "ping",
  Array.from({ length: N(0.9) }, (_, i) => {
    const t = i / SR;
    return (Math.sin(2 * Math.PI * 1568 * t) * 0.6 + Math.sin(2 * Math.PI * 2349 * t) * 0.3) * env(t, 0.004, 0.22);
  }),
);

// Toque no ecrã.
wav(
  "toque",
  Array.from({ length: N(0.08) }, (_, i) => {
    const t = i / SR;
    return Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t / 0.012) * 0.5 + rnd() * Math.exp(-t / 0.004) * 0.15;
  }),
);

// "Whoosh" do pedido a viajar: ruído com filtro passa-banda a subir.
{
  const n = N(1.1);
  const s = new Array(n);
  let low = 0;
  let band = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fc = 300 + 2600 * (t / 1.1);
    const f = 2 * Math.sin((Math.PI * fc) / SR);
    const q = 0.35;
    const high = rnd() - low - q * band;
    band += f * high;
    low += f * band;
    s[i] = band * Math.sin(Math.PI * (t / 1.1)) ** 1.5 * 1.4;
  }
  wav("whoosh", s);
}

// Campainha do "Confirmado": duas notas tipo marimba (Mi6, Lá6).
wav(
  "confirmado",
  Array.from({ length: N(1.4) }, (_, i) => {
    const t = i / SR;
    const note = (f, start) => {
      const u = t - start;
      return u < 0 ? 0 : (Math.sin(2 * Math.PI * f * u) + 0.25 * Math.sin(2 * Math.PI * f * 4 * u)) * env(u, 0.003, 0.28);
    };
    return 0.5 * note(1318.5, 0) + 0.5 * note(1760, 0.12);
  }),
);

// Fundo musical calmo (22 s, da viragem ao fim): acordes suaves Lá–Fá#m–Ré–Mi.
{
  const len = 22;
  const n = N(len);
  const s = new Array(n).fill(0);
  const chords = [
    [220, 277.18, 329.63, 440],
    [185, 220, 277.18, 369.99],
    [146.83, 220, 293.66, 369.99],
    [164.81, 207.65, 246.94, 329.63],
  ];
  const chordLen = 2.75;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const k = Math.floor(t / chordLen) % chords.length;
    const u = t % chordLen;
    const a = Math.min(1, u / 0.6) * Math.min(1, (chordLen - u) / 0.6 + 0.35);
    let v = 0;
    for (const f of chords[k]) v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.003 * t);
    // pulso suave em colcheias (dá ritmo sem bateria)
    const pulse = 0.75 + 0.25 * Math.sin(2 * Math.PI * 2 * t) ** 2;
    const fade = Math.min(1, t / 1.5, (len - t) / 1.2);
    s[i] = v * a * pulse * fade * 0.08;
  }
  wav("fundo", s);
}

// --- Anúncio POV (15 s) ---

// Notificação do telemóvel: duas notas curtas e brilhantes (Si5, Mi6).
wav(
  "notif",
  Array.from({ length: N(0.5) }, (_, i) => {
    const t = i / SR;
    const note = (f, start) => {
      const u = t - start;
      return u < 0 ? 0 : (Math.sin(2 * Math.PI * f * u) + 0.15 * Math.sin(2 * Math.PI * f * 3 * u)) * env(u, 0.002, 0.07);
    };
    return 0.55 * note(987.77, 0) + 0.55 * note(1318.5, 0.07);
  }),
);

// Risco de disco ("Até que…"): ruído filtrado com o filtro a ir e voltar, como o disco a ser puxado.
{
  const len = 0.55;
  const n = N(len);
  const s = new Array(n);
  let low = 0;
  let band = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / len;
    // vai (agudo → grave) e volta (grave → agudo), mais rápido na volta
    const fc = p < 0.6 ? 2600 - 2200 * (p / 0.6) : 400 + 3000 * ((p - 0.6) / 0.4);
    const f = 2 * Math.sin((Math.PI * fc) / SR);
    const high = rnd() - low - 0.12 * band;
    band += f * high;
    low += f * band;
    s[i] = band * Math.sin(Math.PI * p) ** 0.6 * 1.2;
  }
  wav("risco", s);
}

// Batida rápida para o caos (124 bpm, 7 s): bombo a cada tempo, prato fechado no contratempo.
{
  const len = 7;
  const n = N(len);
  const s = new Array(n).fill(0);
  const beat = 60 / 124;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const k = t % beat;
    const h = (t + beat / 2) % beat;
    const kick = Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-k * 30)) * k) * Math.exp(-k / 0.14);
    const hat = rnd() * Math.exp(-h / 0.02) * 0.25;
    // baixo pulsante em Mi
    const bass = Math.sin(2 * Math.PI * 82.4 * t) * 0.25 * (1 - Math.exp(-k * 40)) * Math.exp(-k / 0.2);
    s[i] = (kick * 0.8 + hat + bass) * Math.min(1, t / 0.05, (len - t) / 0.1);
  }
  wav("batida", s);
}
