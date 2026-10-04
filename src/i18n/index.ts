import { useSyncExternalStore } from 'react';
import es from './es.json';
import qu from './qu.json';
import visitor from './visitor.json';

export type Key = keyof typeof es;
export type UiLang = 'qu' | 'es';
export type VisitorLang = 'en' | 'es' | 'qu';

// Idioma de la interfaz. Por defecto quechua: la usuaria principal es quechuahablante.
// Se recuerda en este teléfono (comodidad local; si no hay almacenamiento, vuelve a quechua).
const STORAGE_KEY = 'ui-lang';
function readLang(): UiLang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'es' ? 'es' : 'qu';
  } catch {
    return 'qu';
  }
}

let lang: UiLang = readLang();
document.documentElement.lang = lang === 'qu' ? 'quy' : 'es';
const listeners = new Set<() => void>();

export function setLang(next: UiLang) {
  lang = next;
  document.documentElement.lang = next === 'qu' ? 'quy' : 'es';
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

// Texto en el idioma actual. Si falta el quechua, cae al castellano.
export function t(key: Key, vars?: Record<string, string | number>): string {
  const raw = (lang === 'qu' ? (qu as Record<string, string>)[key] : undefined) || es[key];
  return vars ? raw.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? '')) : raw;
}

// Textos que lee el visitante en el consentimiento.
export function visitorText(key: keyof typeof visitor, vlang: VisitorLang): string {
  return visitor[key][vlang];
}
