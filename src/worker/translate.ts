import { requirePipeline } from './models';

// NLLB está entrenado por oración: con varias oraciones juntas el quechua degenera
// (bucles de repetición, contenido inventado). Se traduce oración por oración.
const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });

export function splitSentences(text: string): string[] {
  return [...segmenter.segment(text)].map((s) => s.segment.trim()).filter(Boolean);
}

// Para el quechua se corta además en cláusulas (comas y antes de but/because/and/so):
// NLLB traduce mucho mejor frases cortas, y así cada trozo pasa o no el filtro por separado.
export function splitClauses(sentence: string): string[] {
  const parts = sentence
    .split(/,\s*|;\s*|\s+(?=(?:but|because|and|so)\s)/i)
    .map((c) => c.trim())
    .filter(Boolean);
  // Las cláusulas de una sola palabra se pegan a la anterior.
  const out: string[] = [];
  for (const c of parts) {
    if (out.length && c.split(/\s+/).length < 2) out[out.length - 1] += ` ${c}`;
    else out.push(c);
  }
  return out.length ? out : [sentence];
}

// Códigos NLLB: eng_Latn, spa_Latn, quy_Latn.
export async function translate(text: string, src: string, tgt: string): Promise<string> {
  const mt = requirePipeline('mt');
  const parts: string[] = [];
  for (const sentence of splitSentences(text)) {
    const out = (await mt(sentence, {
      src_lang: src,
      tgt_lang: tgt,
      max_new_tokens: 128,
      no_repeat_ngram_size: 3,
    })) as { translation_text: string }[];
    parts.push(out[0].translation_text.trim());
  }
  return parts.join(' ');
}
