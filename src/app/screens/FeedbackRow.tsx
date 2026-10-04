import type { Feedback } from '../../data/types';
import { t } from '../../i18n';
import type { Stage } from '../../worker/process';
import { navigate } from '../router';

export function intentLabel(f: Feedback): string {
  return f.intent ? t(`intent.${f.intent.id}`) : t('class.unclear');
}

export function FeedbackRow({ f, stage }: { f: Feedback; stage?: Stage }) {
  const date = new Date(f.createdAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
  let summary: string;
  if (stage) summary = t(`stage.${stage}`) + '…';
  else if (f.status === 'pending' || f.status === 'processing') summary = t('processing.title') + '…';
  else if (f.status === 'error') summary = t('detail.error');
  else summary = intentLabel(f);

  return (
    <li>
      <button className="row-btn" onClick={() => navigate(`/detail/${f.id}`)}>
        <strong>{summary}</strong>
        <span className="muted small">
          {date} · {f.source === 'recording' ? '🎙️' : '💬'}
          {f.textEs && ` · ${f.textEs.slice(0, 70)}${f.textEs.length > 70 ? '…' : ''}`}
        </span>
      </button>
    </li>
  );
}
