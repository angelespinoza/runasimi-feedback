// Prueba de Qwen3-0.6B para "Más ideas": ¿puede escribir recomendaciones cortas en castellano,
// citando reseñas [R#], que luego NLLB pase a quechua con el mismo filtro chrF que la app?
// Uso: node eval/qwen_recs_test.mjs   (descarga ~620 MB la primera vez)
//
// Flujo (igual que la app donde aplica):
// 1. Reseñas EN → ES con NLLB (src/worker/translate.ts: oración por oración).
// 2. Qwen3 (sin "thinking") escribe ≤ 3 recomendaciones en castellano que citan [R#].
// 3. Se descartan las que no citan una reseña válida o no se parecen (e5) a lo que citan.
// 4. Cada recomendación se corta en cláusulas, ES → QU con NLLB, retrotraducción QU → ES
//    y se muestra en quechua solo si chrF ≥ QU_THRESHOLD y no es degenerada.

import { AutoTokenizer, AutoModelForCausalLM, pipeline } from '@huggingface/transformers';
import { writeFileSync } from 'node:fs';
import { chrF, isDegenerate } from '../src/worker/quality.ts';
import { QU_THRESHOLD } from '../src/config.ts';

const QWEN = 'onnx-community/Qwen3-0.6B-ONNX';
const QWEN_DTYPE = 'q8';
// Una recomendación debe parecerse a la reseña que cita; por debajo se marca como posible invento.
const GROUNDING_MIN = 0.8;

// R1–R3: reseñas de prueba de la app (reemplazar por las 3 reales si se quiere comparar).
// R4–R9: quejas SINTÉTICAS de eval/synthetic_reviews.jsonl.
const REVIEWS = [
  { src: 'app', text: 'Our guide was super patient with the kids. We want to come back in the summer.' },
  { src: 'app', text: 'Honestly the coffee was too strong for my taste, but the hills were gorgeous.' },
  { src: 'app', text: 'Lunch was the best meal of our whole trip.' },
  { src: 'synthetic', text: 'There was no toilet anywhere near the plantation.' },
  { src: 'synthetic', text: 'It was too hot and there was nowhere to sit in the shade.' },
  { src: 'synthetic', text: 'I wanted to pay with a credit card but it was cash only.' },
  { src: 'synthetic', text: 'No signs in English made it confusing to find the place.' },
  { src: 'synthetic', text: 'The road was muddy and nobody warned us to bring boots.' },
  { src: 'synthetic', text: 'Bring more water next time, we ran out and there was none to buy.' },
];

const segmenter = new Intl.Segmenter('es', { granularity: 'sentence' });
const sentences = (t) => [...segmenter.segment(t)].map((s) => s.segment.trim()).filter(Boolean);
// Como splitClauses de translate.ts, pero con conjunciones en castellano.
function clausesEs(sentence) {
  const parts = sentence.split(/,\s*|;\s*|\s+(?=(?:pero|porque|y|así que)\s)/i).map((c) => c.trim()).filter(Boolean);
  const out = [];
  for (const c of parts) {
    if (out.length && c.split(/\s+/).length < 2) out[out.length - 1] += ` ${c}`;
    else out.push(c);
  }
  return out.length ? out : [sentence];
}

console.log('Cargando NLLB y e5…');
const mt = await pipeline('translation', 'Xenova/nllb-200-distilled-600M', { dtype: 'q8' });
const e5 = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' });
const tr = async (text, src, tgt) => {
  const parts = [];
  for (const s of sentences(text)) {
    const out = await mt(s, { src_lang: src, tgt_lang: tgt, max_new_tokens: 128, no_repeat_ngram_size: 3 });
    parts.push(out[0].translation_text.trim());
  }
  return parts.join(' ');
};
const embed = async (t) => (await e5([`query: ${t}`], { pooling: 'mean', normalize: true })).tolist()[0];
const cos = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

// 1. EN → ES
const reviewsEs = [];
for (const r of REVIEWS) reviewsEs.push(await tr(r.text, 'eng_Latn', 'spa_Latn'));
const reviewVecs = await Promise.all(reviewsEs.map(embed));

// 2. Qwen3
console.log(`Cargando ${QWEN} (${QWEN_DTYPE})…`);
const tLoad = Date.now();
const tokenizer = await AutoTokenizer.from_pretrained(QWEN);
const model = await AutoModelForCausalLM.from_pretrained(QWEN, { dtype: QWEN_DTYPE });
const loadSeconds = (Date.now() - tLoad) / 1000;

const list = reviewsEs.map((t, i) => `[R${i + 1}] ${t}`).join('\n');
const messages = [
  {
    role: 'system',
    content:
      'Ayudas a una pequeña finca de café que recibe turistas. Lees reseñas de visitantes y propones mejoras concretas y baratas. ' +
      'Responde solo en castellano. Escribe como máximo 3 recomendaciones, una por línea, empezando con "- ". ' +
      'Cada recomendación tiene una sola frase corta (máximo 15 palabras) y termina citando las reseñas que la justifican, por ejemplo [R2] o [R2][R5]. ' +
      'No inventes problemas que no estén en las reseñas.',
  },
  // Ejemplo (few-shot) con reseñas inventadas que NO están en la prueba: muestra que se pide una acción, no copiar la queja.
  { role: 'user', content: 'Reseñas:\n[R1] La visita fue muy bonita.\n[R2] No había dónde lavarse las manos antes de comer.\n[R3] El bus nos dejó lejos y nadie nos esperaba.\n\nRecomendaciones:' },
  { role: 'assistant', content: '- Poner un lavamanos con jabón junto al comedor. [R2]\n- Esperar a los visitantes en la parada del bus. [R3]' },
  { role: 'user', content: `Reseñas:\n${list}\n\nRecomendaciones:` },
];
const prompt = tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true, enable_thinking: false });
const inputs = tokenizer(prompt);
const promptTokens = inputs.input_ids.dims[1];

const tGen = Date.now();
const output = await model.generate({ ...inputs, max_new_tokens: 160, do_sample: false, repetition_penalty: 1.1 });
const genSeconds = (Date.now() - tGen) / 1000;
const newTokens = output.dims[1] - promptTokens;
const raw = tokenizer.decode(output.slice(null, [promptTokens, null]), { skip_special_tokens: true }).trim();

// 3. Filtro de citas y anclaje
const recs = [];
for (const line of raw.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('-'))) {
  const cites = [...line.matchAll(/\[R(\d+)\]/g)].map((m) => Number(m[1]));
  const valid = cites.filter((n) => n >= 1 && n <= REVIEWS.length);
  const text = line.replace(/^-\s*/, '').replace(/\s*(\[R\d+\]\s*)+/g, ' ').trim();
  let grounding = null;
  if (valid.length) {
    const v = await embed(text);
    grounding = Math.max(...valid.map((n) => cos(v, reviewVecs[n - 1])));
  }
  const reason = !cites.length ? 'sin cita' : valid.length < cites.length ? 'cita inválida' : grounding < GROUNDING_MIN ? 'poco anclada' : null;
  recs.push({ line, text, cites, grounding: grounding && +grounding.toFixed(3), kept: !reason, reason });
}
const kept = recs.filter((r) => r.kept).slice(0, 3);

// 4. ES → QU por cláusula con el filtro chrF de la app
let charsTotal = 0;
let charsQu = 0;
for (const r of kept) {
  r.clauses = [];
  for (const s of sentences(r.text)) {
    for (const clause of clausesEs(s)) {
      const qu = await tr(clause, 'spa_Latn', 'quy_Latn');
      const back = await tr(qu, 'quy_Latn', 'spa_Latn');
      const conf = chrF(back, clause);
      const showQu = conf >= QU_THRESHOLD && !isDegenerate(qu);
      charsTotal += clause.length;
      if (showQu) charsQu += clause.length;
      r.clauses.push({ es: clause, qu, back, chrF: +conf.toFixed(3), showQu });
    }
  }
  r.display = r.clauses.map((c) => (c.showQu ? c.qu : c.es)).join(', ');
}

const results = {
  model: `${QWEN} (${QWEN_DTYPE}, Node CPU)`,
  load_seconds: +loadSeconds.toFixed(1),
  prompt_tokens: promptTokens,
  new_tokens: newTokens,
  gen_seconds: +genSeconds.toFixed(1),
  tokens_per_second: +(newTokens / genSeconds).toFixed(1),
  reviews: REVIEWS.map((r, i) => ({ id: `R${i + 1}`, src: r.src, en: r.text, es: reviewsEs[i] })),
  raw_output: raw,
  recommendations: recs,
  kept: kept.length,
  dropped: recs.length - kept.length,
  quechua_share_chars: charsTotal ? +(charsQu / charsTotal).toFixed(3) : 0,
  shown: kept.map((r) => ({ display: r.display, cites: r.cites })),
};
writeFileSync(new URL('./qwen_recs_results.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');

console.log('\nReseñas en castellano:');
results.reviews.forEach((r) => console.log(`  ${r.id} ${r.es}`));
console.log(`\nSalida de Qwen:\n${raw}\n`);
for (const r of recs) console.log(`${r.kept ? '✔' : '✘'} ${r.text}  ${JSON.stringify(r.cites)}  e5=${r.grounding}${r.reason ? `  (${r.reason})` : ''}`);
console.log('\nLo que vería Noor:');
for (const r of kept) {
  console.log(`  • ${r.display}  ${r.cites.map((n) => `[R${n}]`).join('')}`);
  for (const c of r.clauses) console.log(`      ${c.showQu ? 'QU' : 'ES'} chrF=${c.chrF}  ${c.es} → ${c.qu}`);
}
console.log(`\n${results.tokens_per_second} tok/s (${newTokens} tokens en ${results.gen_seconds} s), carga ${results.load_seconds} s`);
console.log(`Quechua mostrado: ${(results.quechua_share_chars * 100).toFixed(0)} % de los caracteres → eval/qwen_recs_results.json`);
