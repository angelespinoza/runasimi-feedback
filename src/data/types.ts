// Modelo de datos del SPEC. Todo vive en IndexedDB del teléfono.

export type TopicId = 'coffee_tasting' | 'landscape' | 'guide' | 'food' | 'missing';
export type IntentId = 'buy_coffee' | 'price' | 'booking' | 'location' | 'return';
export type ClassId = TopicId | IntentId | 'unclear';

export type Visitor = {
  id: string;
  name?: string;
  phone?: string; // E.164, solo si consentMessages = true
  language: 'en';
  consentRecording: boolean;
  consentMessages: boolean;
  consentAt: string; // ISO
  visitDate: string; // ISO date
};

export type Scored<T> = { id: T; score: number };

// Una oración de la reseña: su quechua se muestra solo si pasa el filtro de confianza;
// si no, se muestra el español con el aviso "No estoy seguro".
export type Segment = { en: string; es: string; qu: string; quConfidence: number; showQu: boolean };

export type Feedback = {
  id: string;
  visitorId?: string;
  source: 'recording' | 'whatsapp_share';
  createdAt: string;
  audioBlob?: Blob; // se elimina tras procesar
  transcriptEn: string;
  textEs: string;
  textQu: string;
  quConfidence: number; // 0–1, promedio de las oraciones ponderado por longitud
  showQu: boolean; // al menos una oración muestra quechua
  segments?: Segment[]; // ausente en reseñas procesadas antes del filtro por oración
  topics: Scored<TopicId>[];
  intent: Scored<IntentId> | null;
  status: 'pending' | 'processing' | 'error' | 'new' | 'reviewed' | 'replied';
  error?: string;
  truncated?: boolean;
};

export type Reply = {
  id: string;
  feedbackId: string;
  templateId: string;
  slots: Record<string, string>;
  textEs: string;
  textEn: string;
  lang?: 'en' | 'es' | 'qu'; // idioma en que se envió (por defecto inglés)
  textSent?: string; // texto exacto que se abrió en WhatsApp
  approvedAt?: string;
  sentVia: 'whatsapp_link' | 'share';
};
