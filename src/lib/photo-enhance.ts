/**
 * Melhora uma foto de um prato tirada no restaurante, no próprio telemóvel: estica os níveis
 * (tira o véu cinzento de uma foto escura ou baça), aclara um pouco as fotos escuras e dá um
 * pouco mais de cor. É sempre a foto real: só a luz e a cor mudam, de forma conservadora.
 */

/** Píxeis RGBA (como em ImageData.data). Altera o array e devolve-o. */
export function enhancePixels(data: Uint8ClampedArray): Uint8ClampedArray {
  const pixels = data.length / 4;
  if (pixels === 0) return data;

  // Histograma da luminosidade (amostra de até ~40 mil píxeis, chega para os percentis).
  const hist = new Uint32Array(256);
  const step = Math.max(1, Math.floor(pixels / 40_000));
  let sampled = 0;
  for (let p = 0; p < pixels; p += step) {
    const i = p * 4;
    hist[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++;
    sampled++;
  }
  const percentile = (q: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= q * sampled) return v;
    }
    return 255;
  };
  const low = Math.min(percentile(0.01), 20);
  const high = Math.max(percentile(0.99), 110);
  const scale = Math.min(255 / Math.max(1, high - low), 1.8);

  // Luminosidade média depois de esticar: fotos escuras ganham um pouco de luz (gama < 1).
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += hist[v] * Math.min(255, Math.max(0, (v - low) * scale));
  const mean = sum / sampled;
  const gamma = mean < 100 ? 0.8 : mean < 120 ? 0.9 : 1;

  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const stretched = Math.min(1, Math.max(0, ((v - low) * scale) / 255));
    lut[v] = Math.round(255 * Math.pow(stretched, gamma));
  }

  const saturation = 1.1;
  for (let i = 0; i < data.length; i += 4) {
    const r = lut[data[i]];
    const g = lut[data[i + 1]];
    const b = lut[data[i + 2]];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = l + (r - l) * saturation;
    data[i + 1] = l + (g - l) * saturation;
    data[i + 2] = l + (b - l) * saturation;
  }
  return data;
}
