import { AutoModelForCausalLM, AutoTokenizer, env, type PreTrainedModel, type PreTrainedTokenizer, type ProgressInfo, type Tensor } from '@huggingface/transformers';

// EXPERIMENTAL ("Más ideas"): Qwen3-0.6B propone recomendaciones en castellano citando reseñas [R#].
// Worker aparte para no mezclar sus ~500 MB con los modelos principales. Mismo prompt que la
// primera corrida de eval/qwen_recs_test.mjs (sin few-shot: con ejemplo copiaba el ejemplo).

env.allowLocalModels = false;
env.useBrowserCache = true;

export const QWEN_ID = 'onnx-community/Qwen3-0.6B-ONNX';

export type QwenRequest = { type: 'generate'; reviews: string[]; device: 'webgpu' | 'wasm'; dtype: 'q4f16' | 'q4' | 'q8' };
export type QwenResponse =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'stage'; stage: 'loading' | 'generating' }
  | { type: 'result'; raw: string; newTokens: number; genSeconds: number; loadSeconds: number; device: string; dtype: string }
  | { type: 'error'; message: string };

const post = (msg: QwenResponse) => self.postMessage(msg);

let loaded: { tokenizer: PreTrainedTokenizer; model: PreTrainedModel; key: string } | null = null;

async function load(device: QwenRequest['device'], dtype: QwenRequest['dtype']) {
  const key = `${device}:${dtype}`;
  if (loaded?.key === key) return loaded;
  const progress_callback = (p: ProgressInfo) => {
    if (p.status === 'progress') post({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
  };
  const tokenizer = await AutoTokenizer.from_pretrained(QWEN_ID, { progress_callback });
  const model = await AutoModelForCausalLM.from_pretrained(QWEN_ID, { device, dtype, progress_callback });
  loaded = { tokenizer, model, key };
  return loaded;
}

function buildMessages(reviews: string[]) {
  const list = reviews.map((t, i) => `[R${i + 1}] ${t}`).join('\n');
  return [
    {
      role: 'system',
      content:
        'Ayudas a una pequeña finca de café que recibe turistas. Lees reseñas de visitantes y propones mejoras concretas y baratas. ' +
        'Responde solo en castellano. Escribe como máximo 3 recomendaciones, una por línea, empezando con "- ". ' +
        'Cada recomendación tiene una sola frase corta (máximo 15 palabras) y termina citando las reseñas que la justifican, por ejemplo [R2] o [R2][R5]. ' +
        'No inventes problemas que no estén en las reseñas.',
    },
    { role: 'user', content: `Reseñas:\n${list}\n\nRecomendaciones:` },
  ];
}

self.onmessage = async (e: MessageEvent<QwenRequest>) => {
  const req = e.data;
  try {
    post({ type: 'stage', stage: 'loading' });
    const t0 = performance.now();
    const { tokenizer, model } = await load(req.device, req.dtype);
    const loadSeconds = (performance.now() - t0) / 1000;

    post({ type: 'stage', stage: 'generating' });
    // enable_thinking no está en los tipos, pero transformers.js pasa las opciones extra a la plantilla de Qwen3.
    const options = { tokenize: false, add_generation_prompt: true, enable_thinking: false } as { tokenize: false; add_generation_prompt: true };
    const prompt = tokenizer.apply_chat_template(buildMessages(req.reviews), options) as string;
    const inputs = tokenizer(prompt);
    const promptTokens = (inputs.input_ids as Tensor).dims[1];
    const t1 = performance.now();
    const output = (await model.generate({ ...inputs, max_new_tokens: 160, do_sample: false, repetition_penalty: 1.1 })) as Tensor;
    const genSeconds = (performance.now() - t1) / 1000;
    const raw = tokenizer.decode(output.slice(null, [promptTokens, output.dims[1]]), { skip_special_tokens: true }).trim();
    post({ type: 'result', raw, newTokens: output.dims[1] - promptTokens, genSeconds, loadSeconds, device: req.device, dtype: req.dtype });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
