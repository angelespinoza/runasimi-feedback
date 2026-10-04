// Traduce FLORES+ devtest con transformers.js y los MISMOS pesos ONNX cuantizados que usa la app
// (Xenova/nllb-200-distilled-600M, dtype q8), con la misma decodificación que src/worker/translate.ts, y calcula la similitud e5 de la retrotraducción.
// Uso: node eval/translate_flores.mjs [n=100]   (requiere antes: uv run eval/flores_eval.py download)

import { pipeline } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'node:fs';

const N = Number(process.argv[2] ?? 100);
const DIR = new URL('./data/', import.meta.url);
const read = (lang) =>
  readFileSync(new URL(`${lang}.jsonl`, DIR), 'utf8').trim().split('\n').slice(0, N).map((l) => JSON.parse(l).text);

const eng = read('eng_Latn');
const spa = read('spa_Latn');
const quy = read('quy_Latn');

const mt = await pipeline('translation', 'Xenova/nllb-200-distilled-600M', { dtype: 'q8' });
const e5 = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' });

const tr = async (text, src, tgt) =>
  (await mt(text, { src_lang: src, tgt_lang: tgt, max_new_tokens: 128, no_repeat_ngram_size: 3 }))[0].translation_text.trim();

async function similarity(a, b) {
  const out = (await e5([`query: ${a}`, `query: ${b}`], { pooling: 'mean', normalize: true })).tolist();
  return out[0].reduce((s, v, i) => s + v * out[1][i], 0);
}

const rows = [];
const t0 = Date.now();
for (let i = 0; i < eng.length; i++) {
  const hypEs = await tr(eng[i], 'eng_Latn', 'spa_Latn');
  const quDirect = await tr(eng[i], 'eng_Latn', 'quy_Latn');
  const quPivot = await tr(hypEs, 'spa_Latn', 'quy_Latn');
  const backDirect = await tr(quDirect, 'quy_Latn', 'spa_Latn');
  const backPivot = await tr(quPivot, 'quy_Latn', 'spa_Latn');
  rows.push({
    i,
    eng: eng[i],
    ref_spa: spa[i],
    ref_quy: quy[i],
    hyp_spa: hypEs,
    hyp_quy_direct: quDirect,
    hyp_quy_pivot: quPivot,
    back_spa_direct: backDirect,
    back_spa_pivot: backPivot,
    sim_direct: await similarity(backDirect, hypEs),
    sim_pivot: await similarity(backPivot, hypEs),
  });
  process.stdout.write(`\r${i + 1}/${eng.length}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

writeFileSync(new URL('./flores_outputs.jsonl', import.meta.url), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log('\n→ eval/flores_outputs.jsonl');
