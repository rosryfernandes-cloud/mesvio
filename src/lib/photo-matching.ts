/**
 * Associação de ficheiros de fotografias aos artigos da ementa pelo nome do ficheiro, para o
 * envio em massa. Ex.: "hamburguer-swara.jpg" → "Hambúrguer Swara (180 g)"; "F162.jpg" → artigo
 * F162 (referência do POS). O resultado é só uma sugestão: o restaurante confirma antes de guardar.
 */
export interface MatchableProduct {
  ref: string;
  name: string;
}

export interface PhotoMatch {
  fileIndex: number;
  productRef: string | null;
  /** 0–1; 1 = referência do POS ou nome igual. */
  score: number;
}

export const MATCH_THRESHOLD = 0.5;

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "com", "a", "o", "as", "os", "em", "the", "of", "and", "with"]);
// Ruído típico em nomes de ficheiros de câmaras, telemóveis e edições.
const NOISE = new Set(["img", "dsc", "dscn", "pxl", "foto", "fotografia", "photo", "image", "imagem", "whatsapp", "final", "copy", "copia", "editada", "edit", "jpg", "jpeg", "png", "webp", "heic"]);

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Palavras significativas de um nome. */
export function tokens(text: string, { isFile = false } = {}): string[] {
  let s = stripAccents(text).toLowerCase();
  if (isFile) s = s.replace(/\.[a-z0-9]{2,5}$/, ""); // extensão
  s = s.replace(/\([^)]*\)/g, " "); // quantidades e notas: "(180 g)", "(5 un.)", "(1)"
  return s
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w) && !(isFile && (NOISE.has(w) || /^\d{4,}$/.test(w))));
}

/** Semelhança entre o nome de um ficheiro e um artigo (0–1). */
export function similarity(fileName: string, product: MatchableProduct): number {
  const base = stripAccents(fileName).toLowerCase().replace(/\.[a-z0-9]{2,5}$/, "").trim();
  if (base === product.ref.toLowerCase()) return 1;
  const f = new Set(tokens(fileName, { isFile: true }));
  const p = new Set(tokens(product.name));
  if (f.size === 0 || p.size === 0) return 0;
  let common = 0;
  for (const w of f) if (p.has(w)) common++;
  return (2 * common) / (f.size + p.size); // coeficiente de Dice
}

/**
 * Melhor associação, sem repetir artigos nem ficheiros: os pares mais parecidos ficam primeiro.
 * Ficheiros sem par acima do limiar ficam por associar (o restaurante escolhe à mão).
 */
export function matchPhotos(fileNames: string[], products: MatchableProduct[], threshold = MATCH_THRESHOLD): PhotoMatch[] {
  const pairs: { fileIndex: number; ref: string; score: number }[] = [];
  fileNames.forEach((name, fileIndex) => {
    for (const p of products) {
      const score = similarity(name, p);
      if (score >= threshold) pairs.push({ fileIndex, ref: p.ref, score });
    }
  });
  pairs.sort((a, b) => b.score - a.score);
  const result: PhotoMatch[] = fileNames.map((_, fileIndex) => ({ fileIndex, productRef: null, score: 0 }));
  const usedRefs = new Set<string>();
  for (const pair of pairs) {
    if (result[pair.fileIndex].productRef || usedRefs.has(pair.ref)) continue;
    result[pair.fileIndex] = { fileIndex: pair.fileIndex, productRef: pair.ref, score: pair.score };
    usedRefs.add(pair.ref);
  }
  return result;
}
