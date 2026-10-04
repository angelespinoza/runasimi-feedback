import type { ReactNode } from 'react';
import { setLang, t, useLang, type Key, type UiLang } from '../i18n';
import { navigate } from './router';

// Ilustraciones de diseno/ convertidas a WebP en public/ui (las precachea el service worker).
export const art = (name: string) => `/ui/${name}.webp`;

// Iconos de línea (heredan el color del texto).
const paths: Record<string, ReactNode> = {
  back: <path d="M19 12H5m6-7-7 7 7 7" />,
  next: <path d="M5 12h14m-6-7 7 7-7 7" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  wifiOff: (
    <>
      <path d="m2 2 20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2-1.4M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 10.7 5" />
      <circle cx="12" cy="20" r="0.6" fill="currentColor" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  sparkles: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z" />,
};

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}

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

export function BackButton({ to }: { to: string }) {
  return (
    <button className="back" onClick={() => navigate(to)} aria-label={t('common.back')}>
      <Icon name="back" />
    </button>
  );
}

// Paisaje de la finca al pie de la pantalla (decorativo).
export function Landscape({ src = 'farm-landscape' }: { src?: string }) {
  return <img className="landscape" src={art(src)} alt="" aria-hidden />;
}

export function Screen({ title, back = '/', children, landscape = true }: {
  title: Key; back?: string | null; children: ReactNode; landscape?: boolean;
}) {
  useLang();
  return (
    <main className="screen">
      <header className="bar">
        {back !== null && <BackButton to={back} />}
        <T k={title} as="h1" />
      </header>
      {children}
      {landscape && <Landscape />}
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
