import data from './templates.json';
import type { IntentId } from './types';

export type SlotId = keyof typeof data.slots;
export type SlotSpec = { type: 'text' | 'date' | 'url'; es: string; placeholder?: string };
// `qu`: versión en quechua escrita por un hablante; null hasta que se valide.
export type Template = { id: string; intent: IntentId | null; es: string; en: string; qu: string | null; slots: SlotId[] };

export const SLOTS = data.slots as Record<SlotId, SlotSpec>;
export const TEMPLATES = data.templates as Template[];

export const templateForIntent = (intent: IntentId | null | undefined) =>
  intent ? TEMPLATES.find((t) => t.intent === intent) : undefined;

// Las fechas van al visitante en inglés; el resto de campos se copian tal cual.
function slotText(id: SlotId, value: string, lang: 'en' | 'es' | 'qu'): string {
  if (SLOTS[id].type === 'date' && value) {
    return new Date(`${value}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-PE', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  }
  return value;
}

export function fill(t: Template, slots: Partial<Record<SlotId, string>>, lang: 'en' | 'es' | 'qu'): string {
  return (t[lang] ?? '').replace(/\{(\w+)\}/g, (_, id: SlotId) => slotText(id, slots[id]?.trim() ?? '', lang) || '___');
}

export const missingSlots = (t: Template, slots: Partial<Record<SlotId, string>>) =>
  t.slots.filter((s) => !slots[s]?.trim());

// wa.me exige el número sin "+" ni espacios. Sin número, Noor elige el contacto en WhatsApp.
export function whatsappLink(textEn: string, phone?: string): string {
  const digits = phone?.replace(/\D/g, '');
  return `https://wa.me/${digits ?? ''}?text=${encodeURIComponent(textEn)}`;
}
