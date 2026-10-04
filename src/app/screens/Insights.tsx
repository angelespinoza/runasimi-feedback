import { useEffect, useState } from 'react';
import { listFeedback } from '../../data/db';
import { computeInsights, type Insight } from '../../data/insights';
import type { Feedback } from '../../data/types';
import { t, type Key } from '../../i18n';
import { navigate } from '../router';
import { Screen, T } from '../ui';
import { FeedbackRow } from './FeedbackRow';

const labelKey = (i: Insight): Key => (i.kind === 'unclear' ? 'class.unclear' : (`${i.kind}.${i.id}` as Key));

function InsightRow({ insight, total }: { insight: Insight; total: number }) {
  return (
    <li>
      <button className="insight" onClick={() => navigate(`/insights/${insight.kind}/${insight.id}`)}>
        <div className="insight-head">
          <T k={labelKey(insight)} />
          <strong className="count">
            {t('insights.count', { n: insight.n, N: total })}
          </strong>
        </div>
        <div className="bar-track" aria-hidden>
          <div className="bar-fill" style={{ width: `${(insight.n / total) * 100}%` }} />
        </div>
        {/* Insights con evidencia: con n = 1 se avisa que el dato es insuficiente. */}
        {insight.n === 1 && <span className="warn small">⚠️ {t('insights.onlyOne')}</span>}
      </button>
    </li>
  );
}

export default function Insights() {
  const [items, setItems] = useState<Feedback[] | null>(null);
  useEffect(() => void listFeedback().then(setItems), []);
  if (!items) return null;
  const { total, topics, intents, unclear } = computeInsights(items);

  return (
    <Screen title="insights.title">
      {total === 0 ? (
        <p className="muted">{t('insights.empty')}</p>
      ) : (
        <>
          <p className="muted">
            {t('insights.visitors', { N: total })}
          </p>
          {topics.length > 0 && (
            <section>
              <T k="insights.topics" as="h2" />
              <ul className="list">{topics.map((i) => <InsightRow key={i.id} insight={i} total={total} />)}</ul>
            </section>
          )}
          {intents.length > 0 && (
            <section>
              <T k="insights.intents" as="h2" />
              <ul className="list">{intents.map((i) => <InsightRow key={i.id} insight={i} total={total} />)}</ul>
            </section>
          )}
          {unclear.n > 0 && (
            <section>
              <ul className="list"><InsightRow insight={unclear} total={total} /></ul>
            </section>
          )}
        </>
      )}
    </Screen>
  );
}

export function InsightEvidence({ kind, id }: { kind: string; id: string }) {
  const [items, setItems] = useState<Feedback[] | null>(null);
  useEffect(() => void listFeedback().then(setItems), []);
  if (!items) return null;
  const { total, topics, intents, unclear } = computeInsights(items);
  const insight = [...topics, ...intents, unclear].find((i) => i.kind === kind && i.id === id);
  const evidence = items.filter((f) => insight?.feedbackIds.includes(f.id));

  return (
    <Screen title="insights.evidence" back="/insights">
      {insight && (
        <section className="card">
          <T k={labelKey(insight)} as="h2" />
          <p className="big">
            {t('insights.count', { n: insight.n, N: total })}
          </p>
          {insight.n === 1 && <p className="warn">⚠️ {t('insights.onlyOne')}</p>}
        </section>
      )}
      <ul className="list">
        {evidence.map((f) => <FeedbackRow key={f.id} f={f} />)}
      </ul>
    </Screen>
  );
}
