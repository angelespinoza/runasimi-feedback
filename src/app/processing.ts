import { useSyncExternalStore } from 'react';
import { MODELS, type Device } from '../config';
import { getFeedback, updateFeedback } from '../data/db';
import { getClient } from '../worker/client';
import type { ProcessResult, Stage } from '../worker/process';
import { decodeTo16kMono } from './audio';
import { cachedBytesByModel } from './modelCache';

// Estado global del procesamiento: sigue corriendo aunque Noor cambie de pantalla.
// `finished` sube cada vez que termina un trabajo, para que las pantallas relean la base.
type State = { modelsReady: boolean; download?: { loaded: number; total: number }; stages: Record<string, Stage>; finished: number };
let state: State = { modelsReady: false, stages: {}, finished: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function useProcessing(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

async function preferredDevice(): Promise<Device> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null;
  return adapter ? 'webgpu' : 'wasm';
}

export async function modelsCached(): Promise<boolean> {
  const sizes = await cachedBytesByModel();
  return Object.values(MODELS).every((m) => (sizes[m.id] ?? 0) > 1e6);
}

const EXPECTED_BYTES = Object.values(MODELS).reduce((s, m) => s + m.approxBytes, 0);

let ensuring: Promise<void> | null = null;

// Descarga (primera vez) o carga desde caché los tres modelos en el worker.
export function ensureModels(): Promise<void> {
  ensuring ??= (async () => {
    await navigator.storage?.persist?.();
    const files: Record<string, { loaded: number; total: number }> = {};
    await getClient().call({ type: 'ensure', device: await preferredDevice() }, (e) => {
      if (e.type !== 'progress') return;
      files[e.file] = { loaded: e.loaded, total: e.total };
      const vals = Object.values(files);
      const total = Math.max(vals.reduce((s, f) => s + f.total, 0), EXPECTED_BYTES);
      set({ download: { loaded: vals.reduce((s, f) => s + f.loaded, 0), total } });
    });
    set({ modelsReady: true, download: undefined });
  })().catch((err) => {
    ensuring = null;
    throw err;
  });
  return ensuring;
}

const running = new Map<string, Promise<void>>();

export function processFeedback(id: string): Promise<void> {
  if (running.has(id)) return running.get(id)!;
  const job = (async () => {
    const fb = await getFeedback(id);
    if (!fb) throw new Error('Reseña no encontrada');
    await updateFeedback(id, { status: 'processing', error: undefined });
    try {
      await ensureModels();
      const audio = fb.audioBlob ? await decodeTo16kMono(fb.audioBlob) : undefined;
      const { data } = await getClient().call<ProcessResult>(
        { type: 'process', audio, text: audio ? undefined : fb.transcriptEn },
        (e) => {
          if (e.type === 'stage') set({ stages: { ...state.stages, [id]: e.stage } });
        },
      );
      // Privacidad: el audio original se borra en cuanto hay transcripción.
      await updateFeedback(id, { ...data, status: 'new', audioBlob: undefined });
    } catch (err) {
      await updateFeedback(id, { status: 'error', error: err instanceof Error ? err.message : String(err) });
    } finally {
      const { [id]: _, ...rest } = state.stages;
      set({ stages: rest, finished: state.finished + 1 });
      running.delete(id);
    }
  })();
  running.set(id, job);
  return job;
}
