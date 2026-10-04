import type { ReactNode } from 'react';
import { setLang, t, useLang, type Key, type UiLang } from '../i18n';
import { navigate } from './router';

// Texto de la interfaz en el idioma elegido (runasimi o castellano).
export function T({ k, as: Tag = 'span' }: { k: Key; as?: 'span' | 'h1' | 'h2' | 'div' }) {
  useLang(); // re-render al cambiar de idioma
  return <Tag className="t">{t(k)}</Tag>;
}

// Selector de idioma de la interfaz; quechua por defecto.
export function LangToggle() {
  const lang = useLang();
  const options: UiLang[] = ['qu', 'es'];
  return (
    <div className="lang-toggle" role="radiogroup" aria-label={t('ui.lang')}>
      {options.map((l) => (
        <button key={l} role="radio" aria-checked={lang === l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
          {t(`ui.lang.${l}`)}
        </button>
      ))}
    </div>
  );
}

export function Screen({ title, back = '/', children }: { title: Key; back?: string | null; children: ReactNode }) {
  useLang();
  return (
    <main className="screen">
      <header className="bar">
        {back !== null && (
          <button className="back" onClick={() => navigate(back)} aria-label={t('common.back')}>
            ←
          </button>
        )}
        <T k={title} as="h1" />
        <span className="bar-spacer" />
        <LangToggle />
      </header>
      {children}
    </main>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="conf" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="conf-fill" style={{ width: `${pct}%` }} />
      <span>{pct}%</span>
    </div>
  );
}
