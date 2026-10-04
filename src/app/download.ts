import { MODELS, type ModelKey } from '../config';

// Descarga de modelos por partes, reanudable.
//
// transformers.js baja cada archivo entero a memoria (y los dos de NLLB a la vez, ~900 MB):
// en un celular la pestaña se queda sin memoria. Aquí cada archivo se baja en trozos de
// CHUNK bytes con peticiones Range; cada trozo se guarda en Cache Storage al llegar, así que
// si se corta la conexión o se cierra la app se retoma desde el último trozo. Al final los
// trozos se unen como Blob (respaldado en disco, sin pasar por la RAM) y se guardan con la
// misma clave que usa transformers.js, que luego los encuentra en caché y no descarga nada.

const HF = 'https://huggingface.co';
const MODEL_CACHE = 'transformers-cache'; // el de transformers.js (env.useBrowserCache)
const PARTS_CACHE = 'model-parts';
const CHUNK = 8 * 1024 * 1024;

// Archivos que pide cada pipeline con dtype q8 (sufijo _quantized), tomados de una carga real.
const FILES: Record<ModelKey, string[]> = {
  asr: [
    'config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer_config.json', 'tokenizer.json',
    'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
  ],
  mt: [
    'config.json', 'generation_config.json', 'tokenizer_config.json', 'tokenizer.json',
    'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
  ],
  embed: ['config.json', 'tokenizer_config.json', 'tokenizer.json', 'onnx/model_quantized.onnx'],
};

const urls = () =>
  (Object.keys(FILES) as ModelKey[]).flatMap((key) => FILES[key].map((f) => `${HF}/${MODELS[key].id}/resolve/main/${f}`));

// Clave de cada trozo: fuera de /<repo>/resolve/ para que no cuente como modelo ya descargado.
const partKey = (url: string, i: number) => `${location.origin}/__model-parts/${encodeURIComponent(url)}/${i}`;

// `waiting`: se está reintentando; `reason`: por qué (sin internet o el error concreto).
export type DownloadProgress = { loaded: number; total: number; waiting: boolean; reason?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Espera a que vuelva la conexión (o un rato, por si `onLine` miente).
const waitOnline = (ms: number) =>
  new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener('online', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, ms);
    window.addEventListener('online', done);
  });

// Reintenta para siempre con espera creciente: una mala señal en la finca no debe perder lo bajado.
async function retry<T>(fn: () => Promise<T>, onWaiting: (w: boolean, reason?: string) => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await fn();
      onWaiting(false);
      return out;
    } catch (err) {
      if (err instanceof FatalError) throw err;
      // Siempre el error real: `navigator.onLine` a veces dice false con wifi (apps instaladas, VPN).
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      onWaiting(true, navigator.onLine ? msg : `offline · ${msg}`);
      const delay = Math.min(30_000, 2_000 * 2 ** Math.min(attempt, 4));
      if (navigator.onLine) await sleep(delay);
      else await waitOnline(delay);
    }
  }
}

// Errores que no se arreglan reintentando (sin espacio, archivo inexistente).
class FatalError extends Error {}
const check = (res: Response, url: string) => {
  if (res.ok) return;
  const msg = `${res.status} ${url}`;
  // 408/429 y 5xx son pasajeros; el resto de 4xx no.
  throw res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 ? new FatalError(msg) : new Error(msg);
};

async function cachedSize(cache: Cache, key: string): Promise<number | null> {
  const res = await cache.match(key);
  if (!res) return null;
  const len = res.headers.get('content-length');
  return len ? Number(len) : (await res.blob()).size;
}

async function put(cache: Cache, key: string, body: Blob, type = 'application/octet-stream') {
  try {
    await cache.put(key, new Response(body, { headers: { 'content-type': type, 'content-length': String(body.size) } }));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      throw new FatalError('No hay espacio suficiente en el teléfono para los modelos');
    }
    throw err;
  }
}

// Tamaño remoto, o 0 si el servidor no lo dice: Hugging Face sirve comprimidos los archivos chicos
// (configs, tokenizers) sin content-length. Esos se bajan enteros, de una vez.
async function remoteSize(url: string): Promise<number> {
  const res = await fetch(url, { method: 'HEAD' });
  check(res, url);
  return Number(res.headers.get('content-length')) || 0;
}

// Bytes ya descargados (completos o en trozos) y total esperado, sin tocar la red.
export async function downloadedBytes(): Promise<{ loaded: number; total: number }> {
  const models = await caches.open(MODEL_CACHE);
  const parts = await caches.open(PARTS_CACHE);
  let loaded = 0;
  for (const url of urls()) {
    const size = await cachedSize(models, url);
    if (size !== null) {
      loaded += size;
      continue;
    }
    for (let i = 0; ; i++) {
      const s = await cachedSize(parts, partKey(url, i));
      if (s === null) break;
      loaded += s;
    }
  }
  return { loaded, total: Object.values(MODELS).reduce((s, m) => s + m.approxBytes, 0) };
}

export async function allModelFilesCached(): Promise<boolean> {
  const models = await caches.open(MODEL_CACHE);
  for (const url of urls()) if (!(await models.match(url))) return false;
  return true;
}

export async function downloadModels(onProgress: (p: DownloadProgress) => void): Promise<void> {
  const models = await caches.open(MODEL_CACHE);
  const parts = await caches.open(PARTS_CACHE);
  const list = urls();

  const sizes = new Map<string, number>();
  const done = new Map<string, number>();
  let total = Object.values(MODELS).reduce((s, m) => s + m.approxBytes, 0);
  let waiting = false;
  let reason: string | undefined;
  const report = () => onProgress({ loaded: [...done.values()].reduce((a, b) => a + b, 0), total, waiting, reason });
  const setWaiting = (w: boolean, why?: string) => {
    if (w === waiting && why === reason) return;
    waiting = w;
    reason = why;
    report();
  };

  // Tamaño de cada archivo: del caché si ya está, si no de la red (HEAD).
  for (const url of list) {
    const local = await cachedSize(models, url);
    sizes.set(url, local ?? (await retry(() => remoteSize(url), setWaiting)));
    done.set(url, local ?? 0);
  }
  // Los de tamaño desconocido (chicos) se estiman en 0 hasta bajarlos.
  total = Math.max(total, [...sizes.values()].reduce((a, b) => a + b, 0));
  report();

  for (const url of list) {
    if (await models.match(url)) continue;
    const size = sizes.get(url)!;

    // Archivos chicos o de tamaño desconocido (configs, tokenizers): de una vez.
    if (size <= CHUNK) {
      const blob = await retry(async () => {
        const res = await fetch(url);
        check(res, url);
        return res.blob();
      }, setWaiting);
      await put(models, url, blob, url.endsWith('.json') ? 'application/json' : undefined);
      done.set(url, blob.size);
      report();
      continue;
    }

    // Archivos grandes: trozo a trozo, saltando los que ya están.
    const n = Math.ceil(size / CHUNK);
    let have = 0;
    for (let i = 0; i < n; i++) {
      const start = i * CHUNK;
      const end = Math.min(size, start + CHUNK) - 1;
      const expected = end - start + 1;
      if ((await cachedSize(parts, partKey(url, i))) === expected) {
        have += expected;
        done.set(url, have);
        report();
        continue;
      }
      const blob = await retry(async () => {
        const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
        check(res, url);
        if (res.status !== 206) throw new FatalError(`El servidor no acepta descargas por partes (${res.status})`);
        const b = await res.blob();
        if (b.size !== expected) throw new Error('Trozo incompleto');
        return b;
      }, setWaiting);
      await put(parts, partKey(url, i), blob);
      have += expected;
      done.set(url, have);
      report();
    }

    // Unir los trozos: Blob de Blobs del caché, se copia disco a disco.
    const blobs: Blob[] = [];
    for (let i = 0; i < n; i++) {
      const res = await parts.match(partKey(url, i));
      if (!res) throw new Error('Falta un trozo; vuelva a intentar');
      blobs.push(await res.blob());
    }
    await put(models, url, new Blob(blobs));
    for (let i = 0; i < n; i++) await parts.delete(partKey(url, i));
  }
  onProgress({ loaded: total, total, waiting: false });
}
