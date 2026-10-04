import type { Feedback } from '../../data/types';
import { getLang, t } from '../../i18n';
import type { Stage } from '../../worker/process';
import { navigate } from '../router';
import { art } from '../ui';

export function intentLabel(f: Feedback): string {
  return f.intent ? t(`intent.${f.intent.id}`) : t('class.unclear');
}

// Icono de cada tema o intención (diseno/noor_ui_components/icons).
const CLASS_ART: Record<string, string> = {
  coffee_tasting: 'icon-coffee_cup',
  landscape: 'icon-leaf',
  guide: 'icon-user',
  food: 'icon-food_cutlery',
  missing: 'icon-warning',
  buy_coffee: 'icon-coffee_sprig',
  price: 'icon-chat_bubble',
  booking: 'icon-calendar_booking',
  location: 'icon-right_arrow',
  return: 'icon-back_arrow',
  unclear: 'icon-leaf',
};
export const classArt = (id: string) => art(CLASS_ART[id] ?? 'icon-leaf');

export function FeedbackRow({ f, stage }: { f: Feedback; stage?: Stage }) {
  const date = new Date(f.createdAt).toLocaleString(getLang() === 'en' ? 'en-US' : 'es-PE', { dateStyle: 'medium', timeStyle: 'short' });
  let summary: string;
  if (stage) summary = t(`stage.${stage}`) + '…';
  else if (f.status === 'pending' || f.status === 'processing') summary = t('processing.title') + '…';
  else if (f.status === 'error') summary = t('detail.error');
  else summary = intentLabel(f);
  const icon = f.intent?.id ?? f.topics[0]?.id ?? 'unclear';
  // En la interfaz en inglés se muestra lo que dijo el visitante si habló en inglés.
  const text = getLang() === 'en' && f.lang !== 'es' && f.transcriptEn ? f.transcriptEn : f.textEs;

  return (
    <li>
      <button className="review-card" onClick={() => navigate(`/detail/${f.id}`)}>
        <img className="avatar" src={classArt(icon)} alt="" aria-hidden />
        <span className="body">
          <strong>{summary}</strong>
          <span className="meta">{date} · {f.source === 'recording' ? '🎙️' : '💬'}</span>
          {text && <span className="text">{text}</span>}
        </span>
      </button>
    </li>
  );
}
