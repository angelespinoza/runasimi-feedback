import { useState } from 'react';
import { ingestShared } from '../../data/ingest';
import { t } from '../../i18n';
import { processFeedback } from '../processing';
import { navigate } from '../router';
import { Screen, T } from '../ui';

// Entrada manual de un mensaje de WhatsApp. En Android, lo normal es compartir desde
// WhatsApp (Web Share Target); esta pantalla explica cómo y sirve de respaldo.
export default function Received() {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(
    new URLSearchParams(location.search).has('error') ? t('detail.error') : null,
  );

  async function submit(input: { audio?: Blob; text?: string }) {
    setError(null);
    try {
      const id = await ingestShared(input);
      void processFeedback(id);
      navigate(`/detail/${id}`, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen title="received.title">
      <p className="hint">📲 {t('received.howto')}</p>
      <section className="card">
        <label className="primary file-btn">
          🎤 <T k="received.pickAudio" />
          <input type="file" accept="audio/*,.opus,.ogg" hidden
            onChange={(e) => e.target.files?.[0] && void submit({ audio: e.target.files[0] })} />
        </label>
      </section>
      <section className="card">
        <T k="received.pasteText" as="h2" />
        <textarea lang="en" rows={4} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Hi! How much is a bag of coffee?" />
        <button className="primary" disabled={!text.trim()} onClick={() => void submit({ text })}>
          <T k="received.process" />
        </button>
      </section>
      {error && <p className="bad">{error}</p>}
    </Screen>
  );
}
