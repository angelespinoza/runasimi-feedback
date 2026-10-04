// Almacén de modelos por trozos, compartido por la descarga (hilo principal) y el worker.
//
// Cada archivo se guarda en Cache Storage como trozos de hasta 8 MB más una entrada "meta"
// que dice cuántos son y cuánto pesa. Nunca se arma un archivo grande con cache.put: en
// Chrome Android guardar una respuesta de ~475 MB falla con "Unexpected internal error"
// y además duplicaría el espacio en disco. Para transformers.js se sirve como Response de
// un Blob hecho de los trozos (sin copiarlos), vía env.customCache.

const PARTS_CACHE = 'model-parts';
const LEGACY_CACHE = 'transformers-cache'; // descargas hechas antes de este almacén

type Meta = { n: number; size: number; type: string };

export const partKey = (url: string, i: number) => `${location.origin}/__model-parts/${encodeURIComponent(url)}/${i}`;
const metaKey = (url: string) => `${location.origin}/__model-parts/${encodeURIComponent(url)}/meta`;

export class FatalError extends Error {}

export async function openParts() {
  return caches.open(PARTS_CACHE);
}

export async function putBlob(cache: Cache, key: string, body: Blob, type = 'application/octet-stream') {
  try {
    await cache.put(key, new Response(body, { headers: { 'content-type': type, 'content-length': String(body.size) } }));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      throw new FatalError('No hay espacio suficiente en el teléfono para los modelos');
    }
    throw err;
  }
}

async function readMeta(cache: Cache, url: string): Promise<Meta | null> {
  const res = await cache.match(metaKey(url));
  return res ? ((await res.json()) as Meta) : null;
}

// Marca el archivo como completo (todos sus trozos guardados).
export async function writeMeta(cache: Cache, url: string, meta: Meta) {
  await cache.put(metaKey(url), new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
}

// Tamaño del archivo si está completo (en trozos o en el caché antiguo), si no null.
export async function storedSize(url: string): Promise<number | null> {
  const meta = await readMeta(await openParts(), url);
  if (meta) return meta.size;
  const legacy = await (await caches.open(LEGACY_CACHE)).match(url);
  if (!legacy) return null;
  const len = legacy.headers.get('content-length');
  return len ? Number(len) : (await legacy.blob()).size;
}

// Archivo chico de una vez: un solo trozo.
export async function storeWhole(url: string, blob: Blob, type?: string) {
  const cache = await openParts();
  await putBlob(cache, partKey(url, 0), blob, type);
  await writeMeta(cache, url, { n: 1, size: blob.size, type: type ?? 'application/octet-stream' });
}

export async function matchFile(url: string): Promise<Response | undefined> {
  const cache = await openParts();
  const meta = await readMeta(cache, url);
  if (meta) {
    const blobs: Blob[] = [];
    for (let i = 0; i < meta.n; i++) {
      const part = await cache.match(partKey(url, i));
      if (!part) return undefined; // incompleto: que se vuelva a bajar
      blobs.push(await part.blob());
    }
    return new Response(new Blob(blobs, { type: meta.type }), {
      headers: { 'content-type': meta.type, 'content-length': String(meta.size) },
    });
  }
  return (await caches.open(LEGACY_CACHE)).match(url);
}

// Caché para transformers.js (env.customCache): lee de los trozos; lo que la librería baje
// por su cuenta (p. ej. el WASM de onnxruntime) se guarda entero.
export const transformersCache = {
  match: (request: string) => matchFile(request),
  put: async (request: string, response: Response) => {
    const blob = await response.blob();
    await storeWhole(request, blob, response.headers.get('content-type') ?? undefined);
  },
};
