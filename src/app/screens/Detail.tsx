import { useEffect, useState } from 'react';
import { getFeedback } from '../../data/db';
import type { Feedback } from '../../data/types';
import { t } from '../../i18n';
import type { Stage } from '../../worker/process';
import { processFeedback, useProcessing } from '../processing';
import { navigate } from '../router';
import { ConfidenceBar, Screen, T } from '../ui';
import { intentLabel } from './FeedbackRow';

const STAGES: Stage[] = ['asr', 'es', 'qu', 'check', 'classify'];

export default function Detail({ id }: { id: string }) {
  const { stages, finished } = useProcessing();
  const stage = stages[id];
  const [f, setF] = useState<Feedback | null | undefined>(undefined);

  useEffect(() => {
    void getFeedback(id).then((fb) => {
      setF(fb ?? null);
      // Reseña pendiente (p. ej. la app se cerró a mitad): retomar el procesamiento.
      if (fb && (fb.status === 'pending' || fb.status === 'processing') && !stage) void processFeedback(id);
    });
  }, [id, stage, finished]);

  if (f === undefined) return null;
  if (f === null) return <Screen title="detail.title"><p className="muted">—</p></Screen>;

  if (f.status === 'pending' || f.status === 'processing') {
    const current = stage ? STAGES.indexOf(stage) : -1;
    return (
      <Screen title="processing.title">
        <ol className="stages">
          {STAGES.filter((s) => s !== 'asr' || f.audioBlob).map((s) => {
            const idx = STAGES.indexOf(s);
            const cls = idx < current ? 'done' : idx === current ? 'active' : '';
            return (
              <li key={s} className={cls}>
                {idx < current ? '✓' : idx === current ? '…' : '·'} <T k={`stage.${s}`} />
              </li>
            );
          })}
        </ol>
      </Screen>
    );
  }

  if (f.status === 'error') {
    return (
      <Screen title="detail.title">
        <section className="card">
          <T k="detail.error" as="h2" />
          <p className="bad small">{f.error}</p>
          <button className="primary" onClick={() => void processFeedback(id)}>{t('detail.retry')}</button>
        </section>
      </Screen>
    );
  }

  return (
    <Screen title="detail.title">
      <section className={`card intent ${f.intent ? '' : 'unclear'}`}>
        <T k="detail.intent" as="div" />
        <p className="big">{intentLabel(f)}</p>
      </section>

      {f.topics.length > 0 && (
        <section>
          <T k="detail.topics" as="h2" />
          <div className="chips">
            {f.topics.map((t) => (
              <span key={t.id} className="chip"><T k={`topic.${t.id}`} /></span>
            ))}
          </div>
        </section>
      )}

      {f.truncated && <p className="warn">{t('detail.truncated')}</p>}

      <section className="card">
        <T k="detail.qu" as="h2" />
        {f.segments ? (
          <>
            {/* Oración por oración: quechua si pasa el filtro; si no, español con "No estoy seguro". */}
            <ol className="segments">
              {f.segments.map((seg, i) => (
                <li key={i} className={seg.showQu ? 'seg-qu' : 'seg-es'}>
                  {seg.showQu ? (
                    <p lang="quy">{seg.qu}</p>
                  ) : (
                    <>
                      <p lang="es">{seg.es}</p>
                      <span className="warn small">⚠️ <T k="detail.notSure" /></span>
                    </>
                  )}
                </li>
              ))}
            </ol>
            {f.showQu && <p className="muted small">{t('detail.autoQu')}</p>}
          </>
        ) : f.showQu ? (
          <>
            <p lang="quy">{f.textQu}</p>
            <p className="muted small">{t('detail.autoQu')}</p>
            <div className="row">
              <span className="muted small">{t('detail.confidence')}</span>
              <ConfidenceBar value={f.quConfidence} />
            </div>
          </>
        ) : (
          <p className="warn">⚠️ <T k="detail.notSure" /></p>
        )}
      </section>

      <section className="card">
        <T k="detail.es" as="h2" />
        <p>{f.textEs}</p>
      </section>

      <details className="card">
        <summary>{t('detail.en')}</summary>
        <p lang="en">{f.transcriptEn}</p>
      </details>

      {/* Fail-safe: sin intención clara no se propone respuesta; Noor puede elegir una a mano. */}
      {!f.intent && <p className="muted">{t('detail.noReply')}</p>}
      <button className={f.intent ? 'primary' : ''} onClick={() => navigate(`/reply/${f.id}`)}>
        💬 <T k={f.intent ? 'detail.reply' : 'reply.other'} />
      </button>
      {f.status === 'replied' && <p className="good">✓ {t('detail.replied')}</p>}
      <button className="link" onClick={() => void processFeedback(id)}>↻ {t('detail.reprocess')}</button>
    </Screen>
  );
}
