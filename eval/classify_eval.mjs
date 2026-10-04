// Evalúa el clasificador (e5 + similitud) sobre eval/synthetic_reviews.jsonl con la MISMA lógica
// que la app (src/worker/classifyCore.ts) y barre umbrales para calibrar CLASS_THRESHOLD.
// Uso: node eval/classify_eval.mjs

import { pipeline } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'node:fs';
import { classifyReview } from '../src/worker/classifyCore.ts';

const taxonomy = JSON.parse(readFileSync(new URL('../src/data/taxonomy.json', import.meta.url), 'utf8'));
const reviews = readFileSync(new URL('./synthetic_reviews.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l));

const e5 = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' });
const embed = async (texts, prefix) =>
  (await e5(texts.map((t) => `${prefix}: ${t}`), { pooling: 'mean', normalize: true })).tolist();

const group = async (g) => Object.fromEntries(await Promise.all(Object.entries(g).map(async ([id, ex]) => [id, await embed(ex, 'passage')])));
const topics = await group(taxonomy.topics);
const intents = await group(taxonomy.intents);

// Igual que src/worker/translate.ts: una oración por segmento.
const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const split = (t) => [...segmenter.segment(t)].map((s) => s.segment.trim()).filter(Boolean);
const vecs = await Promise.all(reviews.map((r) => embed(split(r.text), 'query')));

function evaluate(threshold, margin) {
  let intentOk = 0, strictOk = 0, tp = 0, fp = 0, fn = 0, unclear = 0;
  const errors = [];
  reviews.forEach((r, i) => {
    const out = classifyReview(vecs[i], topics, intents, threshold, margin);
    const predIntent = out.intent?.id ?? null;
    const predTopics = new Set(out.topics.map((t) => t.id));
    const gold = new Set(r.topics);
    const iOk = predIntent === r.intent;
    const tOk = predTopics.size === gold.size && [...gold].every((t) => predTopics.has(t));
    intentOk += iOk;
    strictOk += iOk && tOk;
    for (const t of predTopics) gold.has(t) ? tp++ : fp++;
    for (const t of gold) if (!predTopics.has(t)) fn++;
    if (!predIntent && predTopics.size === 0) unclear++;
    if (!iOk || !tOk) errors.push({ text: r.text, gold: { topics: r.topics, intent: r.intent }, pred: { topics: [...predTopics], intent: predIntent } });
  });
  const n = reviews.length;
  const p = tp / (tp + fp || 1), rec = tp / (tp + fn || 1);
  return {
    threshold, margin,
    intent_accuracy: +(intentOk / n).toFixed(3),
    topic_f1: +((2 * p * rec) / (p + rec || 1)).toFixed(3),
    strict_accuracy: +(strictOk / n).toFixed(3),
    unclear_rate: +(unclear / n).toFixed(3),
    errors,
  };
}

const sweep = [];
for (let t = 0.78; t <= 0.9001; t += 0.01) for (const m of [0, 0.01, 0.02, 0.03]) sweep.push(evaluate(+t.toFixed(2), m));
const best = sweep.reduce((a, b) => (b.intent_accuracy + b.topic_f1 > a.intent_accuracy + a.topic_f1 ? b : a));
const current = evaluate(0.82, 0.03);

const results = {
  dataset: 'eval/synthetic_reviews.jsonl (60 reseñas SINTÉTICAS)',
  model: 'Xenova/multilingual-e5-small (ONNX q8)',
  current_config: { ...current, errors: current.errors.length },
  best: { ...best, errors: undefined },
  best_errors: best.errors,
  sweep: sweep.map(({ errors, ...s }) => s),
};
writeFileSync(new URL('./classify_results.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
console.log('Actual (0.82 / 0.03):', results.current_config);
console.log('Mejor:', results.best);
console.log('Errores con el mejor umbral:');
for (const e of best.errors) console.log(' -', e.text, '\n    gold', JSON.stringify(e.gold), '\n    pred', JSON.stringify(e.pred));
