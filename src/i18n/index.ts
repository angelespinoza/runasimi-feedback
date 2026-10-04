import { useSyncExternalStore } from 'react';
import en from './en.json';
import es from './es.json';
import qu from './qu.json';
import visitor from './visitor.json';

export type Key = keyof typeof es;
export type UiLang = 'qu' | 'es' | 'en';
export const UI_LANGS: UiLang[] = ['qu', 'es', 'en'];
export type VisitorLang = 'en' | 'es' | 'qu';

// Idioma de la interfaz. Por defecto quechua: la usuaria principal es quechuahablante.
// Se recuerda en este teléfono (comodidad local; si no hay almacenamiento, vuelve a quechua).
const STORAGE_KEY = 'ui-lang';
function readLang(): UiLang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return UI_LANGS.includes(saved as UiLang) ? (saved as UiLang) : 'qu';
  } catch {
    return 'qu';
  }
}

let lang: UiLang = readLang();
document.documentElement.lang = lang === 'qu' ? 'quy' : lang;
const listeners = new Set<() => void>();

export function setLang(next: UiLang) {
  lang = next;
  document.documentElement.lang = next === 'qu' ? 'quy' : next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* sin almacenamiento: solo dura esta sesión */
  }
  listeners.forEach((l) => l());
}

export const getLang = () => lang;

export function useLang(): UiLang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => lang,
  );
}

// Texto en el idioma actual. Si falta en quechua o inglés, cae al castellano.
const DICTS: Record<UiLang, Record<string, string>> = { qu, es, en };
export function t(key: Key, vars?: Record<string, string | number>): string {
  const raw = DICTS[lang][key] || es[key];
  return vars ? raw.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? '')) : raw;
}

// Textos que lee el visitante en el consentimiento.
export function visitorText(key: keyof typeof visitor, vlang: VisitorLang): string {
  return visitor[key][vlang];
}
