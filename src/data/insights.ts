import type { Feedback, IntentId, TopicId } from './types';

// Los insights no se guardan: se agregan al vuelo desde Feedback.topics e intent.
export type InsightKind = 'topic' | 'intent' | 'unclear';
export type Insight = { kind: InsightKind; id: TopicId | IntentId | 'unclear'; n: number; feedbackIds: string[] };

export const isProcessed = (f: Feedback) => f.status === 'new' || f.status === 'reviewed' || f.status === 'replied';

export function computeInsights(all: Feedback[]): { total: number; topics: Insight[]; intents: Insight[]; unclear: Insight } {
  const done = all.filter(isProcessed);
  const topics = new Map<TopicId, string[]>();
  const intents = new Map<IntentId, string[]>();
  const unclear: string[] = [];
  for (const f of done) {
    for (const t of f.topics) topics.set(t.id, [...(topics.get(t.id) ?? []), f.id]);
    if (f.intent) intents.set(f.intent.id, [...(intents.get(f.intent.id) ?? []), f.id]);
    if (!f.intent && f.topics.length === 0) unclear.push(f.id);
  }
  const toList = <T extends TopicId | IntentId>(kind: InsightKind, m: Map<T, string[]>): Insight[] =>
    [...m].map(([id, ids]) => ({ kind, id, n: ids.length, feedbackIds: ids })).sort((a, b) => b.n - a.n);
  return {
    total: done.length,
    topics: toList('topic', topics),
    intents: toList('intent', intents),
    unclear: { kind: 'unclear', id: 'unclear', n: unclear.length, feedbackIds: unclear },
  };
}
