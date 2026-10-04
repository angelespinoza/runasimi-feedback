import { CLASS_MARGIN, CLASS_THRESHOLD } from '../config';
import taxonomy from '../data/taxonomy.json';
import type { IntentId, Scored, TopicId } from '../data/types';
import { classifyReview, dot, type ClassExamples } from './classifyCore';
import { requirePipeline } from './models';

// multilingual-e5 exige prefijo: "query: " para la consulta, "passage: " para los ejemplos.
export type E5Prefix = 'query' | 'passage';

export async function embed(texts: string[], prefix: E5Prefix): Promise<number[][]> {
  const extractor = requirePipeline('embed');
  const out = (await extractor(
    texts.map((t) => `${prefix}: ${t}`),
    { pooling: 'mean', normalize: true },
  )) as { tolist: () => number[][] };
  return out.tolist();
}

// Vectores ya normalizados: el producto punto es la similitud coseno.
export const cosine = dot;

// Los ejemplos de la taxonomía se embeben una vez por sesión del worker.
let classVecs: Promise<{ topics: ClassExamples; intents: ClassExamples }> | null = null;

async function embedGroup(group: Record<string, string[]>): Promise<ClassExamples> {
  const out: ClassExamples = {};
  for (const [id, examples] of Object.entries(group)) out[id] = await embed(examples, 'passage');
  return out;
}

function getClassVecs() {
  classVecs ??= (async () => ({
    topics: await embedGroup(taxonomy.topics),
    intents: await embedGroup(taxonomy.intents),
  }))();
  return classVecs;
}

export async function classify(sentences: string[]) {
  const { topics, intents } = await getClassVecs();
  const vecs = sentences.length ? await embed(sentences, 'query') : [];
  const result = classifyReview(vecs, topics, intents, CLASS_THRESHOLD, CLASS_MARGIN);
  return {
    topics: result.topics as Scored<TopicId>[],
    intent: result.intent as Scored<IntentId> | null,
  };
}
