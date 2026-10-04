import { useEffect, useRef, useState } from 'react';
import { MAX_RECORDING_SECONDS } from '../../config';
import { newId, saveFeedback, saveVisitor } from '../../data/db';
import type { Feedback, Visitor } from '../../data/types';
import { t, visitorText, type VisitorLang } from '../../i18n';
import { processFeedback } from '../processing';
import { navigate } from '../router';
import { art, Icon, Screen, T } from '../ui';

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
      language: vlang,
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
      // Whisper no tiene quechua: quien elige quechua o castellano graba en castellano.
      lang: vlang === 'en' ? 'en' : 'es',
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
    <Screen title="consent.title" landscape={false}>
      <div className="segmented" role="radiogroup" aria-label={t('consent.visitorLang')}>
        {(['en', 'es', 'qu'] as VisitorLang[]).map((l) => (
          <button key={l} role="radio" aria-checked={vlang === l} className={vlang === l ? 'on' : ''}
            disabled={recording} onClick={() => setVlang(l)}>
            {t(`reply.lang.${l}`)}
          </button>
        ))}
      </div>
      <img className="consent-hero" src={art('consent-hero')} alt="" aria-hidden />

      <section className="card consent-card" lang={vlang === 'qu' ? 'quy' : vlang}>
        <h2>{t('consent.showVisitor')}</h2>
        <p className="sub">{t('consent.askConsent')}</p>
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
          <span className="with-icon">
            <Icon name="user" />
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={recording} autoComplete="off" />
          </span>
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
        <img className="deco foliage l" src={art('foliage-left')} alt="" aria-hidden />
        <img className="deco foliage r" src={art('foliage-right')} alt="" aria-hidden />
        {recording ? (
          <button className="rec-btn on" onClick={stop}>
            <span className="rec-time">{seconds}s / {MAX_RECORDING_SECONDS}s</span>
            <T k="record.stop" />
          </button>
        ) : (
          <button className="rec-btn" onClick={() => void start()} disabled={!consentRecording || !phoneOk}>
            <Icon name="mic" />
            <T k="record.start" />
          </button>
        )}
        <p className="muted small info-line">
          <Icon name="info" />
          {consentRecording ? t('record.hint') : t('consent.needRecording')}
        </p>
        {error && <p className="bad">{error}</p>}
      </section>
    </Screen>
  );
}
