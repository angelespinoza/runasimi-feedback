import { env, pipeline, type ProgressInfo } from '@huggingface/transformers';
import { MODELS, type Device, type DType, type ModelKey } from '../config';

// Los modelos se descargan una vez y quedan en Cache Storage.
env.allowLocalModels = false;
env.useBrowserCache = true;

export type LoadOptions = {
  device: Device;
  dtype?: DType | Record<string, DType>;
  modelId?: string;
  onProgress?: (info: ProgressInfo) => void;
};

type AnyPipeline = (...args: unknown[]) => Promise<unknown>;

const loaded = new Map<ModelKey, { pipe: AnyPipeline; signature: string }>();

export async function getPipeline(key: ModelKey, opts: LoadOptions): Promise<AnyPipeline> {
  const spec = MODELS[key];
  const modelId = opts.modelId ?? spec.id;
  const dtype = opts.dtype ?? spec.dtype;
  const signature = JSON.stringify([modelId, opts.device, dtype]);

  const cached = loaded.get(key);
  if (cached?.signature === signature) return cached.pipe;
  if (cached) await disposePipeline(key);

  const pipe = (await pipeline(spec.task, modelId, {
    device: opts.device,
    dtype,
    progress_callback: opts.onProgress,
  })) as unknown as AnyPipeline;

  loaded.set(key, { pipe, signature });
  return pipe;
}

export function requirePipeline(key: ModelKey): AnyPipeline {
  const entry = loaded.get(key);
  if (!entry) throw new Error(`Modelo "${key}" no cargado`);
  return entry.pipe;
}

export async function disposePipeline(key: ModelKey) {
  const entry = loaded.get(key);
  if (!entry) return;
  loaded.delete(key);
  await (entry.pipe as unknown as { dispose?: () => Promise<void> }).dispose?.();
}
