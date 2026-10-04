/// <reference lib="webworker" />
import type { ProgressInfo } from '@huggingface/transformers';
import { MODELS, type ModelKey } from '../config';
import { transcribe } from './asr';
import { cosine, embed } from './classify';
import { disposePipeline, getPipeline } from './models';
import { processReview, translateReplyToQu } from './process';
import type { QuQuality, WorkerRequest, WorkerResponse } from './protocol';
import { chrF, isDegenerate } from './quality';
import { translate } from './translate';

const post = (msg: WorkerResponse) => self.postMessage(msg);

const progressFor = (id: number, key: ModelKey) => (info: ProgressInfo) => {
  if (info.status === 'progress') {
    post({ id, type: 'progress', key, file: info.file, loaded: info.loaded, total: info.total });
  }
};

async function handle(req: WorkerRequest): Promise<unknown> {
  switch (req.type) {
    case 'load':
      await getPipeline(req.key, {
        device: req.device,
        dtype: req.dtype,
        modelId: req.modelId,
        onProgress: progressFor(req.id, req.key),
      });
      return null;
    case 'ensure': {
      // Carga los tres modelos; si WebGPU falla en este teléfono, cae a WASM.
      const used: Record<string, string> = {};
      for (const key of Object.keys(MODELS) as ModelKey[]) {
        try {
          await getPipeline(key, { device: req.device, onProgress: progressFor(req.id, key) });
          used[key] = req.device;
        } catch (err) {
          if (req.device === 'wasm') throw err;
          await getPipeline(key, { device: 'wasm', onProgress: progressFor(req.id, key) });
          used[key] = 'wasm';
        }
      }
      return used;
    }
    case 'dispose':
      await disposePipeline(req.key);
      return null;
    case 'asr':
      return transcribe(req.audio);
    case 'translate':
      return translate(req.text, req.src, req.tgt);
    case 'embed':
      return embed(req.texts, req.prefix);
    case 'quality': {
      const [a, b] = await embed([req.backEs, req.textEs], 'query');
      const q: QuQuality = { cosine: cosine(a, b), chrF: chrF(req.backEs, req.textEs), degenerate: isDegenerate(req.textQu) };
      return q;
    }
    case 'process':
      return processReview({ audio: req.audio, text: req.text }, (stage) => post({ id: req.id, type: 'stage', stage }));
    case 'quReply':
      return translateReplyToQu(req.textEs);
  }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const t0 = performance.now();
  try {
    const data = await handle(req);
    post({ id: req.id, type: 'result', data, ms: performance.now() - t0 });
  } catch (err) {
    post({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
