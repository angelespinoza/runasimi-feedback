// Señales de calidad para el quechua automático (fail-safe de traducción).

// chrF (Popović 2015): F-beta sobre n-gramas de caracteres, n = 1..6, beta = 2. Devuelve 0–1.
export function chrF(hyp: string, ref: string, maxN = 6, beta = 2): number {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const h = norm(hyp);
  const r = norm(ref);
  let precision = 0;
  let recall = 0;
  let orders = 0;
  for (let n = 1; n <= maxN; n++) {
    const hg = ngrams(h, n);
    const rg = ngrams(r, n);
    const hTotal = h.length - n + 1;
    const rTotal = r.length - n + 1;
    if (hTotal <= 0 || rTotal <= 0) continue;
    let match = 0;
    for (const [g, c] of hg) match += Math.min(c, rg.get(g) ?? 0);
    precision += match / hTotal;
    recall += match / rTotal;
    orders++;
  }
  if (!orders) return 0;
  precision /= orders;
  recall /= orders;
  if (precision + recall === 0) return 0;
  const b2 = beta * beta;
  return ((1 + b2) * precision * recall) / (b2 * precision + recall);
}

function ngrams(s: string, n: number): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i + n <= s.length; i++) {
    const g = s.slice(i, i + n);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

// Detecta salidas degeneradas de NLLB ("q'apita q'apita q'apita…" o frases repetidas).
export function isDegenerate(text: string): boolean {
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    run = words[i] === words[i - 1] ? run + 1 : 1;
    if (run >= 3) return true;
  }
  const trigrams = new Map<string, number>();
  for (let i = 0; i + 3 <= words.length; i++) {
    const g = words.slice(i, i + 3).join(' ');
    const c = (trigrams.get(g) ?? 0) + 1;
    if (c >= 2) return true;
    trigrams.set(g, c);
  }
  return false;
}
