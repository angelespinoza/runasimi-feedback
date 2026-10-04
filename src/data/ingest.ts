import { newId, saveFeedback } from './db';
import type { Feedback } from './types';

// Crea una reseña pendiente desde WhatsApp (nota de voz y/o texto). La usan el service worker
// (Web Share Target) y la pantalla "Mensaje recibido". El procesamiento ocurre al abrir el Detalle.
export async function ingestShared(input: { audio?: Blob; text?: string }): Promise<string> {
  const text = input.text?.trim() ?? '';
  if (!input.audio && !text) throw new Error('No llegó audio ni texto');
  const feedback: Feedback = {
    id: newId(),
    source: 'whatsapp_share',
    createdAt: new Date().toISOString(),
    audioBlob: input.audio,
    transcriptEn: input.audio ? '' : text,
    textEs: '',
    textQu: '',
    quConfidence: 0,
    showQu: false,
    topics: [],
    intent: null,
    status: 'pending',
  };
  await saveFeedback(feedback);
  return feedback.id;
}
