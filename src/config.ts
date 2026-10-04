// Fuente única de modelos, umbrales y ruta de quechua (ver SPEC.md).

export type DType = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16' | 'bnb4';
export type Device = 'webgpu' | 'wasm';

export type ModelKey = 'asr' | 'mt' | 'embed';

export type ModelSpec = {
  id: string;
  task: 'automatic-speech-recognition' | 'translation' | 'feature-extraction';
  dtype: DType | Record<string, DType>;
  approxBytes: number; // medido en Fase 0 (Cache Storage), para la barra de descarga
};

export const MODELS: Record<ModelKey, ModelSpec> = {
  asr: { id: 'Xenova/whisper-base', task: 'automatic-speech-recognition', dtype: 'q8', approxBytes: 79.7e6 },
  mt: { id: 'Xenova/nllb-200-distilled-600M', task: 'translation', dtype: 'q8', approxBytes: 912.0e6 },
  embed: { id: 'Xenova/multilingual-e5-small', task: 'feature-extraction', dtype: 'q8', approxBytes: 135.4e6 },
};

export const ASR_FALLBACK_ID = 'Xenova/whisper-tiny';

export const LANG = {
  en: 'eng_Latn',
  es: 'spa_Latn',
  qu: 'quy_Latn',
} as const;

// Ruta EN → QU elegida con FLORES+ devtest (eval/results.json): chrF 32,1 pivote vs 31,3 directa.
export const QU_ROUTE: 'direct' | 'pivot' = 'pivot';

// Confianza del quechua = chrF (0–1) entre la retrotraducción QU → ES y el ES directo.
// Calibrado con FLORES: ocultar < 0,35 esconde 48 % y sube el chrF de lo mostrado de 32,0 a 35,7.
// (La similitud e5 a 0,80, como proponía el SPEC, no ocultaba nada.)
export const QU_THRESHOLD = 0.35;
export const CLASS_THRESHOLD = 0.82;
export const CLASS_MARGIN = 0.01; // calibrado en eval/classify_results.json (0.03 dejaba 43% "unclear")

export const MAX_RECORDING_SECONDS = 60;
export const SAMPLE_RATE = 16000;

// Presupuesto total de descarga de modelos.
export const MODEL_BUDGET_MB = 900;
