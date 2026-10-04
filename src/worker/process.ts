import { LANG, QU_ROUTE, QU_THRESHOLD, type SpeechLang } from '../config';
import type { IntentId, Scored, Segment, TopicId } from '../data/types';
import { transcribe } from './asr';
import { classify } from './classify';
import { chrF, isDegenerate } from './quality';
import { splitClauses, splitSentences, translate } from './translate';

export type Stage = 'asr' | 'es' | 'qu' | 'check' | 'classify';

export type ProcessResult = {
  transcriptEn: string;
  truncated: boolean;
  textEs: string;
  textQu: string;
  quConfidence: number;
  showQu: boolean;
  segments: Segment[];
  topics: Scored<TopicId>[];
  intent: Scored<IntentId> | null;
};

// Pipeline del SPEC. Ningún paso genera texto libre hacia el visitante.
// Reseña en castellano: Whisper transcribe en castellano y se salta la traducción EN → ES.
export async function processReview(
  input: { audio?: Float32Array; text?: string; lang?: SpeechLang },
  onStage: (s: Stage) => void,
): Promise<ProcessResult> {
  const lang = input.lang ?? 'en';
  let transcriptEn = input.text?.trim() ?? '';
  let truncated = false;
  if (input.audio) {
    onStage('asr');
    const asr = await transcribe(input.audio, lang);
    transcriptEn = asr.text;
    truncated = asr.truncated;
  }
  const sentences = splitSentences(transcriptEn);
  if (!sentences.length) throw new Error('No se entendió ninguna palabra en el audio');

  const toEs = (t: string) => (lang === 'es' ? Promise.resolve(t) : translate(t, LANG.en, LANG.es));
  onStage('es');
  const es: string[] = [];
  for (const s of sentences) es.push(await toEs(s));

  // Quechua por cláusula: cada trozo corto se traduce, se verifica y se muestra por separado.
  onStage('qu');
  const clauses = sentences.flatMap((s) => splitClauses(s, lang));
  const clauseEs: string[] = [];
  const clauseQu: string[] = [];
  for (const c of clauses) {
    const cEs = clauses.length === sentences.length ? es[clauseEs.length] : await toEs(c);
    clauseEs.push(cEs);
    const direct = QU_ROUTE === 'direct' && lang === 'en';
    clauseQu.push(direct ? await translate(c, LANG.en, LANG.qu) : await translate(cEs, LANG.es, LANG.qu));
  }

  // Confianza por cláusula: retrotraducir QU → ES y comparar con el ES directo (chrF, 0–1).
  // Las que no pasan se muestran en español con "No estoy seguro".
  onStage('check');
  const segments: Segment[] = [];
  for (let i = 0; i < clauses.length; i++) {
    const back = await translate(clauseQu[i], LANG.qu, LANG.es);
    const quConfidence = chrF(back, clauseEs[i]);
    segments.push({
      en: clauses[i],
      es: clauseEs[i],
      qu: clauseQu[i],
      quConfidence,
      showQu: quConfidence >= QU_THRESHOLD && !isDegenerate(clauseQu[i]),
    });
  }
  const weight = (s: Segment) => s.es.length || 1;
  const quConfidence =
    segments.reduce((sum, s) => sum + s.quConfidence * weight(s), 0) / segments.reduce((sum, s) => sum + weight(s), 0);

  onStage('classify');
  const { topics, intent } = await classify(sentences);

  return {
    transcriptEn,
    truncated,
    textEs: es.join(' '),
    textQu: clauseQu.join(' '),
    quConfidence,
    showQu: segments.some((s) => s.showQu),
    segments,
    topics,
    intent,
  };
}

// Traduce una respuesta ya completada (español) al quechua, cláusula por cláusula, y marca
// las cláusulas dudosas. Noor, que habla quechua, revisa y corrige antes de aprobar.
export async function translateReplyToQu(textEs: string): Promise<{ qu: string; doubtful: string[] }> {
  const parts: string[] = [];
  const doubtful: string[] = [];
  for (const sentence of splitSentences(textEs)) {
    for (const clause of splitClauses(sentence, 'es')) {
      const qu = await translate(clause, LANG.es, LANG.qu);
      const back = await translate(qu, LANG.qu, LANG.es);
      if (chrF(back, clause) < QU_THRESHOLD || isDegenerate(qu)) doubtful.push(qu);
      parts.push(qu);
    }
  }
  return { qu: parts.join(' '), doubtful };
}
