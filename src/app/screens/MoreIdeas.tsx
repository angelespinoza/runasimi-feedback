import { useState } from 'react';
import type { Feedback } from '../../data/types';
import { getClient } from '../../worker/client';
import type { QuReply } from '../../worker/protocol';
import { generateIdeas, parseRecommendations, type QwenResult, type Recommendation } from '../../worker/qwenClient';
import { ensureModels } from '../processing';
import { navigate } from '../router';
import { art, Icon } from '../ui';

// EXPERIMENTAL: "Más ideas" con Qwen3-0.6B. En eval/qwen_recs_test.mjs copiaba reseñas e inventaba
// detalles que los filtros no detectaban; está aquí solo para probarlo. Textos fijos en castellano.

const MAX_REVIEWS = 12;
// Similitud e5 mínima entre una idea sin cita y la reseña que se le adjunta (como CLASS_THRESHOLD).
const GROUNDING_MIN = 0.82;

type Idea = Recommendation & { qu?: string };
type Run = { ideas: Idea[]; dropped: string[]; raw: string; stats: QwenResult };

export function MoreIdeas({ items }: { items: Feedback[] }) {
  // Más recientes primero (listFeedback ya viene ordenado); solo reseñas procesadas.
  const reviews = items.filter((f) => f.status !== 'pending' && f.status !== 'error' && f.status !== 'processing' && f.textEs).slice(0, MAX_REVIEWS);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'generating' | 'translating' | 'done'>('idle');
  const [download, setDownload] = useState<{ loaded: number; total: number } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setRun(null);
    const files: Record<string, { loaded: number; total: number }> = {};
    try {
      const stats = await generateIdeas(reviews.map((f) => f.textEs), (e) => {
        if (e.type === 'stage') return setPhase(e.stage);
        files[e.file] = { loaded: e.loaded, total: e.total };
        const vals = Object.values(files);
        setDownload({ loaded: vals.reduce((s, f) => s + f.loaded, 0), total: vals.reduce((s, f) => s + f.total, 0) });
      });
      const parsed = parseRecommendations(stats.raw, reviews.length);
      const { dropped } = parsed;
      setDownload(null);
      setPhase('translating');
      await ensureModels();
      // Sin cita de Qwen: se adjuntan las reseñas más parecidas (e5). Si ninguna se parece, se descarta.
      const auto: Recommendation[] = [];
      if (parsed.uncited.length) {
        const embed = async (texts: string[]) =>
          (await getClient().call<number[][]>({ type: 'embed', texts, prefix: 'query' })).data;
        const rv = await embed(reviews.map((f) => f.textEs));
        const iv = await embed(parsed.uncited);
        parsed.uncited.forEach((text, i) => {
          const sims = rv.map((v) => v.reduce((s, x, k) => s + x * iv[i][k], 0));
          const best = Math.max(...sims);
          const cites = sims.flatMap((s, n) => (s >= GROUNDING_MIN && s >= best - 0.02 ? [n + 1] : [])).slice(0, 2);
          if (cites.length) auto.push({ text, cites, auto: true });
          else dropped.push(text);
        });
      }
      const kept = [...parsed.kept, ...auto].slice(0, 3);
      // Quechua con el mismo NLLB y filtro por cláusula que las respuestas (worker principal).
      const ideas: Idea[] = [];
      try {
        for (const r of kept) {
          const { data } = await getClient().call<QuReply>({ type: 'quReply', textEs: r.text });
          ideas.push({ ...r, qu: data.qu });
        }
      } catch {
        ideas.splice(0, ideas.length, ...kept);
      }
      setRun({ ideas, dropped, raw: stats.raw, stats });
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('idle');
    }
  }

  const busy = phase === 'loading' || phase === 'generating' || phase === 'translating';

  return (
    <section className="card ideas">
      <img className="deco leaf" src={art('leaf-plain')} alt="" aria-hidden />
      <h2><Icon name="sparkles" />Más ideas</h2>
      {reviews.length === 0 ? (
        <p className="muted">Todavía no hay reseñas procesadas.</p>
      ) : (
        <button className="primary" disabled={busy} onClick={() => void start()}>
          <Icon name="sparkles" />
          {busy ? 'Pensando…' : run ? 'Pedir otras ideas' : 'Pedir ideas'}
        </button>
      )}
      {phase === 'loading' && (
        <p className="muted small">
          Preparando…
          {download && download.total > 0 && <progress value={download.loaded} max={download.total} />}
        </p>
      )}
      {error && <p className="bad">{error}</p>}

      {run && (
        <>
          {run.ideas.length === 0 && <p className="muted">Por ahora no hay ideas nuevas.</p>}
          <ul className="list">
            {run.ideas.map((idea, i) => (
              <li key={i}>
                {idea.qu && <p className="t t-qu" lang="quy">{idea.qu}</p>}
                <p className="t t-es">{idea.text}</p>
                <div className="chips">
                  {idea.cites.map((n) => (
                    <button key={n} className="chip" onClick={() => navigate(`/detail/${reviews[n - 1].id}`)}>
                      R{n}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
