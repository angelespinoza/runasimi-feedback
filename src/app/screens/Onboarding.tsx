import { useState } from 'react';
import { setLang, t, useLang, type UiLang } from '../../i18n';
import { art, Icon, Landscape } from '../ui';

// Walkthrough del primer inicio: qué hace la app, que funciona sin internet y el idioma.
// Al terminar sigue la creación del PIN (Lock).
const STORAGE_KEY = 'onboarded';

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true; // sin almacenamiento no se puede recordar: no repetir el walkthrough en cada apertura
  }
}

export function resetOnboarding() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sin almacenamiento */
  }
}

const PAGES = 3;

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const lang = useLang();
  const [page, setPage] = useState(0);

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* sin almacenamiento */
    }
    onDone();
  };
  const next = () => (page < PAGES - 1 ? setPage(page + 1) : finish());

  return (
    <main className="screen onboarding">
      <button className="skip" onClick={finish}>{t('ob.skip')}</button>

      {page === 0 && (
        <>
          <h1>{t('ob.welcome')} <em>{t('ob.brand')}</em></h1>
          <p className="lead">{t('ob.lead')}</p>
          <ol className="steps">
            {([
              ['ob.step1', 'ob.step1.sub', 'ob-voice'],
              ['ob.step2', 'ob.step2.sub', 'ob-insights'],
              ['ob.step3', 'ob.step3.sub', 'ob-whatsapp'],
            ] as const).map(([title, sub, img], i) => (
              <li key={title}>
                <span className="num">{i + 1}</span>
                <div>
                  <strong>{t(title)}</strong>
                  <span>{t(sub)}</span>
                </div>
                <img src={art(img)} alt="" aria-hidden />
              </li>
            ))}
          </ol>
          <div className="feature">
            <span className="ring"><Icon name="wifiOff" /></span>
            <div>
              <strong>{t('ob.offline')}</strong>
              <span>{t('ob.offline.sub')}</span>
            </div>
          </div>
        </>
      )}

      {page === 1 && (
        <>
          <h1>{t('ob.offlineTitle')}</h1>
          <img className="ob-hero" src={art('ob-offline')} alt="" aria-hidden />
          <p className="lead">{t('ob.offlineLead')}</p>
          <div className="feature">
            <span className="ring"><Icon name="user" /></span>
            <div>
              <strong>{t('ob.private')}</strong>
              <span>{t('ob.private.sub')}</span>
            </div>
          </div>
        </>
      )}

      {page === 2 && (
        <>
          <h1>{t('ob.langTitle')}</h1>
          <p className="lead">{t('ob.langLead')}</p>
          <div className="lang-cards" role="radiogroup">
            {(['qu', 'es'] as UiLang[]).map((l) => (
              <button key={l} role="radio" aria-checked={lang === l} className={`lang-card ${lang === l ? 'on' : ''}`}
                onClick={() => setLang(l)}>
                <span>
                  {t(`ui.lang.${l}`)}
                  <small>{t(`ob.lang.${l}.sub`)}</small>
                </span>
                <span className="radio" aria-hidden />
              </button>
            ))}
          </div>
          <img className="ob-hero" src={art('ob-voice')} alt="" aria-hidden style={{ width: '70%' }} />
        </>
      )}

      <div className="ob-foot">
        <div className="pager" aria-label={`${page + 1} / ${PAGES}`}>
          {Array.from({ length: PAGES }, (_, i) => <span key={i} className={i === page ? 'on' : ''} />)}
        </div>
        <button className="primary" onClick={next}>
          {t(page < PAGES - 1 ? 'ob.next' : 'ob.start')} <Icon name="next" />
        </button>
        <Landscape src="ob-landscape" />
      </div>
    </main>
  );
}
