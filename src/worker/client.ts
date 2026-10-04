import type { WorkerRequest, WorkerResponse } from './protocol';

export type WorkerEvent = Extract<WorkerResponse, { type: 'progress' | 'stage' }>;
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type Request = DistributiveOmit<WorkerRequest, 'id'>;

// Envuelve el Web Worker en llamadas con promesa; toda la inferencia vive allí.
export class PipelineClient {
  private worker = new Worker(new URL('./pipeline.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (r: { data: unknown; ms: number }) => void; reject: (e: Error) => void; onEvent?: (e: WorkerEvent) => void }
  >();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      if (msg.type === 'progress' || msg.type === 'stage') return entry.onEvent?.(msg);
      this.pending.delete(msg.id);
      if (msg.type === 'result') entry.resolve({ data: msg.data, ms: msg.ms });
      else entry.reject(new Error(msg.message));
    };
  }

  call<T>(req: Request, onEvent?: (e: WorkerEvent) => void): Promise<{ data: T; ms: number }> {
    const id = this.nextId++;
    const transfer = (req.type === 'asr' || req.type === 'process') && req.audio ? [req.audio.buffer] : [];
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (r: { data: unknown; ms: number }) => void, reject, onEvent });
      this.worker.postMessage({ ...req, id }, transfer);
    });
  }
}

let shared: PipelineClient | null = null;
export const getClient = () => (shared ??= new PipelineClient());
