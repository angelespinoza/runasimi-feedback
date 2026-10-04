import { useEffect, useRef, useState } from 'react';
import { ASR_FALLBACK_ID, LANG, MODEL_BUDGET_MB, MODELS, type Device, type DType, type ModelKey } from '../config';
import { getClient, type PipelineClient, type Request } from '../worker/client';
import type { QuQuality } from '../worker/protocol';
import { decodeTo16kMono } from './audio';
import { cachedBytesByModel, clearModelCache, mb } from './modelCache';

// Fase 0: harness que carga los tres modelos en el navegador y mide tiempos y tamaños.

const DTYPES: DType[] = ['q8', 'q4', 'q4f16', 'fp16', 'fp32'];
const DEFAULT_TEXT = 'The coffee tasting was amazing, can I buy roasted beans?';

const formatQuality = (q: QuQuality) =>
  `e5 coseno ${q.cosine.toFixed(3)} · chrF retro ${(q.chrF * 100).toFixed(1)}${q.degenerate ? ' · DEGENERADO' : ''}`;

type Measurement = { label: string; ms: number; targetMs?: number; output?: string };
type ModelState = { device: Device; dtype: DType; modelId: string; status: string; loadMs?: number };

type DeviceInfo = {
  userAgent: string;
  webgpu: string;
  cores: number;
  memoryGB?: number;
  quotaMB?: number;
  usageMB?: number;
  persisted?: boolean;
};

async function readDeviceInfo(): Promise<DeviceInfo> {
  let webgpu = 'no disponible';
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<{ info?: { vendor?: string; architecture?: string } } | null> } }).gpu;
  if (gpu) {
    const adapter = await gpu.requestAdapter().catch(() => null);
    webgpu = adapter ? `sí (${adapter.info?.vendor ?? '?'} ${adapter.info?.architecture ?? ''})`.trim() : 'API presente, sin adaptador';
  }
  const est = await navigator.storage?.estimate?.();
  return {
    userAgent: navigator.userAgent,
    webgpu,
    cores: navigator.hardwareConcurrency,
    memoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    quotaMB: est?.quota ? est.quota / 1e6 : undefined,
    usageMB: est?.usage ? est.usage / 1e6 : undefined,
    persisted: await navigator.storage?.persisted?.(),
  };
}

export default function Bench() {
  const client = useRef<PipelineClient | null>(null);
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [models, setModels] = useState<Record<ModelKey, ModelState>>(() => {
    const initial = {} as Record<ModelKey, ModelState>;
    for (const key of Object.keys(MODELS) as ModelKey[]) {
      initial[key] = { device: 'wasm', dtype: MODELS[key].dtype as DType, modelId: MODELS[key].id, status: 'sin cargar' };
    }
    return initial;
  });
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [text, setText] = useState(DEFAULT_TEXT);
  const [results, setResults] = useState<Measurement[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.current = getClient();
    void readDeviceInfo().then((i) => {
      setInfo(i);
      if (i.webgpu.startsWith('sí')) {
        setModels((m) => {
          const next = { ...m };
          for (const key of Object.keys(next) as ModelKey[]) next[key] = { ...next[key], device: 'webgpu' };
          return next;
        });
      }
    });
    void cachedBytesByModel().then(setSizes);
  }, []);

  const patchModel = (key: ModelKey, patch: Partial<ModelState>) =>
    setModels((m) => ({ ...m, [key]: { ...m[key], ...patch } }));

  const record = (m: Measurement) => setResults((r) => [...r, m]);

  async function run<T>(req: Request): Promise<{ data: T; ms: number }> {
    return client.current!.call<T>(req);
  }

  async function guarded(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setInfo(await readDeviceInfo());
      setSizes(await cachedBytesByModel());
    }
  }

  const load = (key: ModelKey) =>
    guarded(async () => {
      const m = models[key];
      const files: Record<string, { loaded: number; total: number }> = {};
      patchModel(key, { status: 'cargando…', loadMs: undefined });
      const t0 = performance.now();
      try {
        await client.current!.call({ type: 'load', key, device: m.device, dtype: m.dtype, modelId: m.modelId }, (p) => {
          if (p.type !== 'progress') return;
          files[p.file] = { loaded: p.loaded, total: p.total };
          const loaded = Object.values(files).reduce((s, f) => s + f.loaded, 0);
          const total = Object.values(files).reduce((s, f) => s + f.total, 0);
          patchModel(key, { status: `descargando ${mb(loaded)} / ${mb(total)}` });
        });
      } catch (e) {
        patchModel(key, { status: 'error' });
        throw e;
      }
      const ms = performance.now() - t0;
      patchModel(key, { status: 'listo', loadMs: ms });
      record({ label: `Carga ${m.modelId} (${m.device}, ${m.dtype})`, ms });
    });

  const runAsr = (source: Blob | 'sample') =>
    guarded(async () => {
      const blob = source === 'sample' ? await (await fetch('/bench/review-en.wav')).blob() : source;
      const audio = await decodeTo16kMono(blob);
      const seconds = audio.length / 16000;
      const { data, ms } = await run<{ text: string; truncated: boolean }>({ type: 'asr', audio });
      record({
        label: `ASR ${seconds.toFixed(1)} s de audio`,
        ms,
        targetMs: (seconds / 15) * 10_000, // meta: 15 s en < 10 s
        output: data.text + (data.truncated ? ' [recortado a 60 s]' : ''),
      });
      setText(data.text);
    });

  const runTranslations = () =>
    guarded(async () => {
      const es = await run<string>({ type: 'translate', text, src: LANG.en, tgt: LANG.es });
      record({ label: 'EN → ES', ms: es.ms, targetMs: 5000, output: es.data });

      const quDirect = await run<string>({ type: 'translate', text, src: LANG.en, tgt: LANG.qu });
      record({ label: 'EN → QU (directa)', ms: quDirect.ms, output: quDirect.data });

      const quPivot = await run<string>({ type: 'translate', text: es.data, src: LANG.es, tgt: LANG.qu });
      record({ label: 'ES → QU (pivote, desde ES)', ms: quPivot.ms, output: quPivot.data });

      for (const [route, qu] of [['directa', quDirect.data], ['pivote', quPivot.data]] as const) {
        const back = await run<string>({ type: 'translate', text: qu, src: LANG.qu, tgt: LANG.es });
        record({ label: `QU → ES retrotraducción (${route})`, ms: back.ms, output: back.data });
        if (models.embed.status === 'listo') {
          const q = await run<QuQuality>({ type: 'quality', textEs: es.data, textQu: qu, backEs: back.data });
          record({ label: `Confianza QU (${route})`, ms: q.ms, output: formatQuality(q.data) });
        }
      }
    });

  const runFullPipeline = () =>
    guarded(async () => {
      const t0 = performance.now();
      const blob = await (await fetch('/bench/review-en.wav')).blob();
      const audio = await decodeTo16kMono(blob);
      const asr = await run<{ text: string }>({ type: 'asr', audio });
      const es = await run<string>({ type: 'translate', text: asr.data.text, src: LANG.en, tgt: LANG.es });
      const qu = await run<string>({ type: 'translate', text: asr.data.text, src: LANG.en, tgt: LANG.qu });
      const back = await run<string>({ type: 'translate', text: qu.data, src: LANG.qu, tgt: LANG.es });
      const q = await run<QuQuality>({ type: 'quality', textEs: es.data, textQu: qu.data, backEs: back.data });
      await run<number[][]>({ type: 'embed', texts: [asr.data.text], prefix: 'query' });
      record({
        label: 'Pipeline completo (ASR → ES → QU → retro → confianza → embedding)',
        ms: performance.now() - t0,
        targetMs: 30_000,
        output: `QU: ${qu.data} · ${formatQuality(q.data)}`,
      });
    });

  const totalBytes = Object.values(models).reduce((s, m) => s + (sizes[m.modelId] ?? 0), 0);
  const allLoaded = Object.values(models).every((m) => m.status === 'listo');

  const report = { date: new Date().toISOString(), device: info, models, cachedBytes: sizes, results };

  return (
    <main className="bench">
      <h1>Fase 0 · Harness de modelos</h1>
      <p className="muted">Carga Whisper, NLLB-200 y e5 en este navegador y mide tiempos y tamaños. Toda la inferencia corre en un Web Worker.</p>

      <section>
        <h2>Dispositivo</h2>
        {info ? (
          <dl>
            <dt>WebGPU</dt><dd>{info.webgpu}</dd>
            <dt>Núcleos</dt><dd>{info.cores}</dd>
            <dt>RAM (aprox.)</dt><dd>{info.memoryGB ? `${info.memoryGB} GB` : 'desconocida'}</dd>
            <dt>Almacenamiento</dt><dd>{info.usageMB?.toFixed(0)} MB usados de {info.quotaMB?.toFixed(0)} MB</dd>
            <dt>Persistente</dt>
            <dd>
              {info.persisted ? 'sí' : 'no'}{' '}
              {!info.persisted && (
                <button onClick={() => void navigator.storage.persist().then(() => readDeviceInfo().then(setInfo))}>Pedir</button>
              )}
            </dd>
            <dt>Navegador</dt><dd className="small">{info.userAgent}</dd>
          </dl>
        ) : '…'}
      </section>

      <section>
        <h2>Modelos</h2>
        {(Object.keys(MODELS) as ModelKey[]).map((key) => {
          const m = models[key];
          return (
            <div key={key} className="model">
              <div className="row">
                <strong>{key}</strong>
                {key === 'asr' ? (
                  <select value={m.modelId} disabled={busy} onChange={(e) => patchModel(key, { modelId: e.target.value, status: 'sin cargar' })}>
                    <option value={MODELS.asr.id}>{MODELS.asr.id}</option>
                    <option value={ASR_FALLBACK_ID}>{ASR_FALLBACK_ID}</option>
                  </select>
                ) : (
                  <code>{m.modelId}</code>
                )}
              </div>
              <div className="row">
                <select value={m.device} disabled={busy} onChange={(e) => patchModel(key, { device: e.target.value as Device, status: 'sin cargar' })}>
                  <option value="webgpu">webgpu</option>
                  <option value="wasm">wasm</option>
                </select>
                <select value={m.dtype} disabled={busy} onChange={(e) => patchModel(key, { dtype: e.target.value as DType, status: 'sin cargar' })}>
                  {DTYPES.map((d) => <option key={d}>{d}</option>)}
                </select>
                <button disabled={busy} onClick={() => void load(key)}>Cargar</button>
              </div>
              <div className="small">
                {m.status}
                {m.loadMs !== undefined && ` · ${(m.loadMs / 1000).toFixed(1)} s`}
                {sizes[m.modelId] !== undefined && ` · en caché: ${mb(sizes[m.modelId])}`}
              </div>
            </div>
          );
        })}
        <p className={totalBytes / 1e6 > MODEL_BUDGET_MB ? 'bad' : 'good'}>
          Total en caché de los modelos seleccionados: {mb(totalBytes)} (meta &lt; {MODEL_BUDGET_MB} MB)
        </p>
        <button disabled={busy} onClick={() => void guarded(clearModelCache)}>Borrar caché de modelos</button>
      </section>

      <section>
        <h2>Pruebas</h2>
        <div className="row">
          <button disabled={busy || models.asr.status !== 'listo'} onClick={() => void runAsr('sample')}>ASR: audio de ejemplo (12 s)</button>
          <label className="file">
            ASR: subir audio (p. ej. nota de WhatsApp)
            <input type="file" accept="audio/*" disabled={busy || models.asr.status !== 'listo'}
              onChange={(e) => e.target.files?.[0] && void runAsr(e.target.files[0])} />
          </label>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
        <div className="row">
          <button disabled={busy || models.mt.status !== 'listo'} onClick={() => void runTranslations()}>Traducciones + confianza</button>
          <button disabled={busy || !allLoaded} onClick={() => void runFullPipeline()}>Pipeline completo</button>
        </div>
        {busy && <p className="muted">Procesando…</p>}
        {error && <p className="bad">Error: {error}</p>}
      </section>

      <section>
        <h2>Resultados</h2>
        <table>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}>
                <td>
                  {r.label}
                  {r.output && <div className="small">{r.output}</div>}
                </td>
                <td className={r.targetMs === undefined ? '' : r.ms <= r.targetMs ? 'good' : 'bad'}>
                  {(r.ms / 1000).toFixed(2)} s
                  {r.targetMs !== undefined && <div className="small">meta {(r.targetMs / 1000).toFixed(1)} s</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button onClick={() => void navigator.clipboard.writeText(JSON.stringify(report, null, 2))}>Copiar reporte JSON</button>
          <button onClick={() => setResults([])}>Limpiar</button>
        </div>
      </section>
    </main>
  );
}
