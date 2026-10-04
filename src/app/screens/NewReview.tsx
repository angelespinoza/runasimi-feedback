import { useEffect, useRef, useState } from 'react';
import { MAX_RECORDING_SECONDS } from '../../config';
import { newId, saveFeedback, saveVisitor } from '../../data/db';
import type { Feedback, Visitor } from '../../data/types';
import { t, visitorText, type VisitorLang } from '../../i18n';
import { processFeedback } from '../processing';
import { navigate } from '../router';
import { Screen, T } from '../ui';

const normalizePhone = (raw: string) => raw.replace(/[\s()-]/g, '');
const isE164 = (p: string) => /^\+[1-9]\d{7,14}$/.test(p);

export default function NewReview() {
  // El visitante lee el consentimiento en su idioma (inglés por defecto).
  const [vlang, setVlang] = useState<VisitorLang>('en');
  const [consentRecording, setConsentRecording] = useState(false);
  const [consentMessages, setConsentMessages] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    window.clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const phoneOk = !consentMessages || phone === '' || isE164(normalizePhone(phone));

  async function start() {
    if (!consentRecording) return; // guardrail: nunca graba sin consentimiento
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError(t('record.noMic'));
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      void save(new Blob(chunks, { type: rec.mimeType }));
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
    setSeconds(0);
    const t0 = Date.now();
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setSeconds(s);
      if (s >= MAX_RECORDING_SECONDS) stop();
    }, 250);
  }

  function stop() {
    window.clearInterval(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    setRecording(false);
  }

  async function save(audioBlob: Blob) {
    const now = new Date().toISOString();
    const visitor: Visitor = {
      id: newId(),
      name: name.trim() || undefined,
      // El teléfono solo se guarda con el consentimiento de mensajes.
      phone: consentMessages && phone ? normalizePhone(phone) : undefined,
      language: 'en',
      consentRecording,
      consentMessages,
      consentAt: now,
      visitDate: now.slice(0, 10),
    };
    const feedback: Feedback = {
      id: newId(),
      visitorId: visitor.id,
      source: 'recording',
      createdAt: now,
      audioBlob,
      transcriptEn: '',
      textEs: '',
      textQu: '',
      quConfidence: 0,
      showQu: false,
      topics: [],
      intent: null,
      status: 'pending',
    };
    await saveVisitor(visitor);
    await saveFeedback(feedback);
    void processFeedback(feedback.id);
    navigate(`/detail/${feedback.id}`, true);
  }

  return (
    <Screen title="consent.title">
      <p className="hint">👉 {t('consent.showVisitor')}</p>
      <section>
        <T k="consent.visitorLang" as="h2" />
        <div className="segmented" role="radiogroup">
          {(['en', 'es', 'qu'] as VisitorLang[]).map((l) => (
            <button key={l} role="radio" aria-checked={vlang === l} className={vlang === l ? 'on' : ''}
              disabled={recording} onClick={() => setVlang(l)}>
              {t(`reply.lang.${l}`)}
            </button>
          ))}
        </div>
      </section>
      <section className="card" lang={vlang === 'qu' ? 'quy' : vlang}>
        <label className="check">
          <input type="checkbox" checked={consentRecording} disabled={recording}
            onChange={(e) => setConsentRecording(e.target.checked)} />
          <span>{visitorText('consent.recording', vlang)}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={consentMessages} disabled={recording}
            onChange={(e) => setConsentMessages(e.target.checked)} />
          <span>{visitorText('consent.messages', vlang)}</span>
        </label>
        <label className="field">
          <span>{visitorText('consent.name', vlang)}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={recording} autoComplete="off" />
        </label>
        {consentMessages && (
          <label className="field">
            <span>{visitorText('consent.phone', vlang)}</span>
            <input type="tel" inputMode="tel" placeholder="+1 555 123 4567" value={phone}
              onChange={(e) => setPhone(e.target.value)} disabled={recording} autoComplete="off" />
            {!phoneOk && <span className="bad small">+&lt;country&gt;&lt;number&gt;</span>}
          </label>
        )}
      </section>

      <section className="record">
        {recording ? (
          <button className="rec-btn on" onClick={stop}>
            <span className="rec-time">{seconds}s / {MAX_RECORDING_SECONDS}s</span>
            <T k="record.stop" />
          </button>
        ) : (
          <button className="rec-btn" onClick={() => void start()} disabled={!consentRecording || !phoneOk}>
            <span className="icon" aria-hidden>🎙️</span>
            <T k="record.start" />
          </button>
        )}
        <p className="muted small">
          {consentRecording ? t('record.hint') : t('consent.needRecording')}
        </p>
        {error && <p className="bad">{error}</p>}
      </section>
    </Screen>
  );
}
