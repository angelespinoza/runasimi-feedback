import type { Device, DType, ModelKey } from '../config';
import type { Stage } from './process';

export type WorkerRequest =
  | { id: number; type: 'load'; key: ModelKey; device: Device; dtype?: DType; modelId?: string }
  | { id: number; type: 'ensure'; device: Device }
  | { id: number; type: 'dispose'; key: ModelKey }
  | { id: number; type: 'asr'; audio: Float32Array }
  | { id: number; type: 'translate'; text: string; src: string; tgt: string }
  | { id: number; type: 'embed'; texts: string[]; prefix: 'query' | 'passage' }
  | { id: number; type: 'quality'; textEs: string; textQu: string; backEs: string }
  | { id: number; type: 'process'; audio?: Float32Array; text?: string }
  | { id: number; type: 'quReply'; textEs: string };

// Respuesta traducida al quechua: `doubtful` = cláusulas que no pasaron el filtro de confianza.
export type QuReply = { qu: string; doubtful: string[] };

export type QuQuality = { cosine: number; chrF: number; degenerate: boolean };

export type WorkerResponse =
  | { id: number; type: 'progress'; key: ModelKey; file: string; loaded: number; total: number }
  | { id: number; type: 'stage'; stage: Stage }
  | { id: number; type: 'result'; data: unknown; ms: number }
  | { id: number; type: 'error'; message: string };
