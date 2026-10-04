import type { QwenRequest, QwenResponse } from './qwen.worker';

// EXPERIMENTAL: cliente del worker de Qwen ("Más ideas"). Un trabajo a la vez.
export type QwenEvent = Extract<QwenResponse, { type: 'progress' | 'stage' }>;
export type QwenResult = Extract<QwenResponse, { type: 'result' }>;

// `auto`: Qwen no citó y las reseñas se buscaron por similitud e5.
export type Recommendation = { text: string; cites: number[]; auto?: boolean };

let worker: Worker | null = null;

async function pickBackend(): Promise<Pick<QwenRequest, 'device' | 'dtype'>> {
  type Adapter = { features: Set<string> };
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<Adapter | null> } }).gpu;
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null;
  if (!adapter) return { device: 'wasm', dtype: 'q8' };
  return { device: 'webgpu', dtype: adapter.features.has('shader-f16') ? 'q4f16' : 'q4' };
}

export async function generateIdeas(reviews: string[], onEvent: (e: QwenEvent) => void): Promise<QwenResult> {
  worker ??= new Worker(new URL('./qwen.worker.ts', import.meta.url), { type: 'module' });
  const req: QwenRequest = { type: 'generate', reviews, ...(await pickBackend()) };
  const w = worker;
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<QwenResponse>) => {
      const msg = e.data;
      if (msg.type === 'result') resolve(msg);
      else if (msg.type === 'error') reject(new Error(msg.message));
      else onEvent(msg);
    };
    w.postMessage(req);
  });
}

// Líneas de recomendación ("- ", "* ", "• " o "1. "). Acepta citas [R2], (R2), R2 o [2].
// Las que citan reseñas válidas van a `kept`; las que no citan, a `uncited` (se buscan con e5);
// las que citan una reseña que no existe se descartan.
const BULLET = /^(?:[-*•]|\d+[.)])\s+/;
const CITE = /\[\s*R?\s*(\d+)\s*\]|\(\s*R\s*(\d+)\s*\)|\bR\s?(\d+)\b/gi;

export function parseRecommendations(
  raw: string,
  nReviews: number,
): { kept: Recommendation[]; uncited: string[]; dropped: string[] } {
  const kept: Recommendation[] = [];
  const uncited: string[] = [];
  const dropped: string[] = [];
  for (const line of raw.split('\n').map((l) => l.trim()).filter((l) => BULLET.test(l))) {
    const cites = [...line.matchAll(CITE)].map((m) => Number(m[1] ?? m[2] ?? m[3]));
    const text = line.replace(BULLET, '').replace(CITE, '').replace(/\s*[,;]?\s*$/, '').replace(/\s{2,}/g, ' ').trim();
    if (!text) continue;
    if (!cites.length) uncited.push(text);
    else if (cites.every((n) => n >= 1 && n <= nReviews)) kept.push({ text, cites: [...new Set(cites)] });
    else dropped.push(line);
  }
  return { kept, uncited, dropped };
}
