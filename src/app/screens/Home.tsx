import { useEffect, useState } from 'react';
import { listFeedback } from '../../data/db';
import type { Feedback } from '../../data/types';
import { t, useLang } from '../../i18n';
import { mb } from '../modelCache';
import { ensureModels, modelsCached, useProcessing } from '../processing';
import { navigate } from '../router';
import { LangToggle, T } from '../ui';
import { FeedbackRow } from './FeedbackRow';

export default function Home() {
  const { modelsReady, download, stages, finished } = useProcessing();
  useLang();
  const [cached, setCached] = useState<boolean | null>(null);
  const [items, setItems] = useState<Feedback[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void modelsCached().then(setCached);
  }, [modelsReady]);

  useEffect(() => {
    void listFeedback().then(setItems);
  }, [stages, finished]);

  const startDownload = () => {
    setError(null);
    ensureModels().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <main className="screen">
      <header className="bar">
        <T k="app.title" as="h1" />
        <span className="bar-spacer" />
        <LangToggle />
        <button className="back" onClick={() => navigate('/settings')} aria-label={t('settings.title')}>⚙️</button>
      </header>

      {cached === false && !modelsReady && (
        <section className="card setup">
          <T k="setup.title" as="h2" />
          <p>{t('setup.body')}</p>
          {download ? (
            <>
              <progress value={download.loaded} max={download.total || 1} />
              <p className="muted">
                {t('setup.downloading')} {mb(download.loaded)} / {mb(download.total)}
              </p>
            </>
          ) : (
            <button className="primary" onClick={startDownload}>
              {t('setup.download')}
            </button>
          )}
          {error && <p className="bad">{error}</p>}
        </section>
      )}

      <nav className="grid">
        <button className="tile" onClick={() => navigate('/new')}>
          <span className="icon" aria-hidden>🎙️</span>
          <T k="home.newReview" />
        </button>
        <button className="tile" onClick={() => navigate('/received')}>
          <span className="icon" aria-hidden>💬</span>
          <T k="home.received" />
        </button>
        <button className="tile" onClick={() => navigate('/insights')}>
          <span className="icon" aria-hidden>📊</span>
          <T k="home.insights" />
        </button>
        <button className="tile" disabled title={t('common.soon')}>
          <span className="icon" aria-hidden>📷</span>
          <T k="home.photo" />
        </button>
      </nav>

      <section>
        <T k="home.recent" as="h2" />
        {items.length === 0 ? (
          <p className="muted">{t('home.empty')}</p>
        ) : (
          <ul className="list">
            {items.map((f) => (
              <FeedbackRow key={f.id} f={f} stage={stages[f.id]} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
