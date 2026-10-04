// Lógica pura de clasificación, sin imports: la reutiliza eval/classify_eval.mjs en Node.

export type Vec = number[];
export type ClassExamples = Record<string, Vec[]>;
export type ClassScore = { id: string; score: number };

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Puntaje de una clase = máxima similitud contra sus frases de ejemplo.
export function scoreClasses(query: Vec, classes: ClassExamples): ClassScore[] {
  return Object.entries(classes)
    .map(([id, examples]) => ({ id, score: Math.max(...examples.map((e) => dot(query, e))) }))
    .sort((a, b) => b.score - a.score);
}

// Asigna la mejor clase si supera el umbral y le saca margen a la segunda; si no, null ("unclear").
export function pick(scores: ClassScore[], threshold: number, margin: number): ClassScore | null {
  const [first, second] = scores;
  if (!first || first.score < threshold) return null;
  if (second && first.score - second.score < margin) return null;
  return first;
}

// Una reseña tiene varias oraciones: cada una aporta como máximo un tema y una intención.
export function classifyReview(
  sentenceVecs: Vec[],
  topics: ClassExamples,
  intents: ClassExamples,
  threshold: number,
  margin: number,
): { topics: ClassScore[]; intent: ClassScore | null } {
  const topicBest = new Map<string, number>();
  let intent: ClassScore | null = null;
  for (const v of sentenceVecs) {
    const t = pick(scoreClasses(v, topics), threshold, margin);
    if (t) topicBest.set(t.id, Math.max(topicBest.get(t.id) ?? 0, t.score));
    const i = pick(scoreClasses(v, intents), threshold, margin);
    if (i && (!intent || i.score > intent.score)) intent = i;
  }
  return {
    topics: [...topicBest].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score),
    intent,
  };
}
