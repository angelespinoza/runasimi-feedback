import { useEffect, useState } from 'react';
import { listFeedback } from '../../data/db';
import type { Feedback } from '../../data/types';
import { t, useLang } from '../../i18n';
import { mb } from '../modelCache';
import { ensureModels, modelsCached, useProcessing } from '../processing';
import { navigate } from '../router';
import { art, Icon, Landscape, LangToggle, T } from '../ui';
import { FeedbackRow } from './FeedbackRow';

export default function Home() {
  const { modelsReady, download, stages, finished } = useProcessing();
  useLang();
  const [cached, setCached] = useState<boolean | null>(null);
  const [items, setItems] = useState<Feedback[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

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

  const tiles = [
    { cls: 'tile-new', to: '/new', icon: 'action-mic', leaf: 'leaf-plain', k: 'home.newReview', sub: 'home.newReview.sub' },
    { cls: 'tile-msg', to: '/received', icon: 'action-message', leaf: 'leaf-berries', k: 'home.received', sub: 'home.received.sub' },
    { cls: 'tile-ins', to: '/insights', icon: 'action-analytics', leaf: 'leaf-plain', k: 'home.insights', sub: 'home.insights.sub' },
    { cls: 'tile-photo', to: null, icon: 'action-camera', leaf: null, k: 'home.photo', sub: 'home.photo.sub' },
  ] as const;
  const shown = showAll ? items : items.slice(0, 3);

  return (
    <main className="screen">
      <header className="home-head">
        <img className="deco branch" src={art('branch-header')} alt="" aria-hidden />
        <T k="app.title" as="h1" />
        <LangToggle />
        <button className="icon-btn" onClick={() => navigate('/settings')} aria-label={t('settings.title')}>
          <Icon name="gear" />
        </button>
      </header>

      {cached === false && !modelsReady ? (
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
      ) : (
        <div className="offline-banner">
          <Icon name="wifiOff" />
          <div>
            <strong>{t('home.offline')}</strong>
            <span>{t('home.offline.sub')}</span>
          </div>
          <img src={art('offline-landscape')} alt="" aria-hidden />
        </div>
      )}

      <nav className="tiles">
        {tiles.map((tile) => (
          <button key={tile.k} className={`tile ${tile.cls}`} disabled={!tile.to} title={tile.to ? undefined : t('common.soon')}
            onClick={() => tile.to && navigate(tile.to)}>
            {tile.leaf && <img className="tile-leaf" src={art(tile.leaf)} alt="" aria-hidden />}
            <img className="tile-icon" src={art(tile.icon)} alt="" aria-hidden />
            <strong>{t(tile.k)}</strong>
            <span className="sub">{tile.to ? t(tile.sub) : t('common.soon')}</span>
            <span className="go" aria-hidden><Icon name="next" /></span>
          </button>
        ))}
      </nav>

      <section>
        <div className="section-head">
          <T k="home.recent" as="h2" />
          {items.length > 3 && (
            <button className="see-all" onClick={() => setShowAll(!showAll)}>
              {t(showAll ? 'home.seeLess' : 'home.seeAll')} ›
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="muted">{t('home.empty')}</p>
        ) : (
          <ul className="list">
            {shown.map((f) => (
              <FeedbackRow key={f.id} f={f} stage={stages[f.id]} />
            ))}
          </ul>
        )}
      </section>
      <Landscape />
    </main>
  );
}
