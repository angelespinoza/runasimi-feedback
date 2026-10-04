import { useEffect, useState } from 'react';
import { getFeedback, getVisitor, newId, saveReply, updateFeedback } from '../../data/db';
import {
  fill, missingSlots, SLOTS, TEMPLATES, templateForIntent, whatsappLink,
  type SlotId, type Template,
} from '../../data/templates';
import type { Feedback, Visitor } from '../../data/types';
import { t, useLang, type Key } from '../../i18n';
import { getClient } from '../../worker/client';
import type { QuReply } from '../../worker/protocol';
import { ensureModels } from '../processing';
import { Screen, T } from '../ui';

type Lang = 'en' | 'es' | 'qu';
const LANGS: Lang[] = ['en', 'es', 'qu'];

// Último valor usado de cada campo (precio, enlace…): comodidad local, no dato crítico.
const SLOT_MEMORY = 'reply-slots';
function loadSlots(): Partial<Record<SlotId, string>> {
  try {
    return JSON.parse(localStorage.getItem(SLOT_MEMORY) ?? '{}');
  } catch {
    return {};
  }
}
function rememberSlots(slots: Partial<Record<SlotId, string>>) {
  try {
    const { date: _, ...keep } = slots; // la fecha cambia en cada reserva
    localStorage.setItem(SLOT_MEMORY, JSON.stringify({ ...loadSlots(), ...keep }));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export default function Reply({ feedbackId }: { feedbackId: string }) {
  const [f, setF] = useState<Feedback | null>(null);
  const [visitor, setVisitor] = useState<Visitor | undefined>();
  const [template, setTemplate] = useState<Template | undefined>();
  const [choosing, setChoosing] = useState(false);
  const [slots, setSlots] = useState<Partial<Record<SlotId, string>>>(loadSlots);
  const [lang, setLang] = useState<Lang>('en');
  // Quechua: traducción automática que Noor revisa y corrige (ella habla quechua).
  const [qu, setQu] = useState<{ text: string; doubtful: string[]; fromEs: string } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const uiLang = useLang();
  const [quEdit, setQuEdit] = useState<{ base: string; text: string } | null>(null);

  useEffect(() => {
    void getFeedback(feedbackId).then(async (fb) => {
      if (!fb) return;
      setF(fb);
      setTemplate(templateForIntent(fb.intent?.id));
      if (fb.visitorId) {
        const v = await getVisitor(fb.visitorId);
        // Solo se escribe a quien dio consentimiento de mensajes.
        setVisitor(v?.consentMessages ? v : undefined);
      }
    });
  }, [feedbackId]);

  if (!f) return null;

  const missing = template ? missingSlots(template, slots) : [];
  const textEn = template ? fill(template, slots, 'en') : '';
  const textEs = template ? fill(template, slots, 'es') : '';
  // Plantilla con quechua validado por un hablante: se usa tal cual, sin traducción automática.
  const quFixed = template?.qu ? fill(template, slots, 'qu') : null;
  // Noor puede corregir el quechua fijo; si cambian los datos, se parte otra vez del texto fijo.
  const quFixedText = quFixed && quEdit?.base === quFixed ? quEdit.text : quFixed;
  const quStale = !quFixed && !!qu && qu.fromEs !== textEs;
  const quText = (quFixedText ?? qu?.text ?? '').trim();
  const textSent = lang === 'en' ? textEn : lang === 'es' ? textEs : quText;
  const canSend = !!template && missing.length === 0 && textSent !== '' && !(lang === 'qu' && !quFixed && (translating || quStale));

  async function translateToQu() {
    setTranslating(true);
    setError(null);
    try {
      await ensureModels();
      const { data } = await getClient().call<QuReply>({ type: 'quReply', textEs });
      setQu({ text: data.qu, doubtful: data.doubtful, fromEs: textEs });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTranslating(false);
    }
  }

  function approveAndSend() {
    if (!template || !canSend) return;
    // Humano en el loop: este toque es la aprobación. WhatsApp se abre con el texto y Noor envía.
    window.open(whatsappLink(textSent, visitor?.phone), '_blank', 'noopener');
    rememberSlots(slots);
    setSent(true);
    void saveReply({
      id: newId(),
      feedbackId,
      templateId: template.id,
      slots: slots as Record<string, string>,
      textEs,
      textEn,
      lang,
      textSent,
      approvedAt: new Date().toISOString(),
      sentVia: 'whatsapp_link',
    }).then(() => updateFeedback(feedbackId, { status: 'replied' }));
  }

  const suggested = templateForIntent(f.intent?.id);

  return (
    <Screen title="reply.title" back={`/detail/${feedbackId}`}>
      {(choosing || !template) ? (
        <section>
          <T k={suggested ? 'reply.other' : 'detail.noReply'} as="h2" />
          <div className="choices">
            {TEMPLATES.map((t) => (
              <button key={t.id} className={`choice ${t.id === template?.id ? 'on' : ''}`}
                onClick={() => { setTemplate(t); setChoosing(false); setSent(false); setQu(null); }}>
                <T k={`reply.template.${t.id}` as Key} />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="row spread">
          <span className="chip on">
            <T k={`reply.template.${template.id}` as Key} />
          </span>
          <button onClick={() => setChoosing(true)}>{t('reply.other')}</button>
        </section>
      )}

      {template && !choosing && (
        <>
          {template.slots.length > 0 && (
            <section className="card">
              <T k="reply.fill" as="h2" />
              {template.slots.map((id) => (
                <label key={id} className="field">
                  <span>{t(`slot.${id}`)}</span>
                  <input
                    type={SLOTS[id].type === 'date' ? 'date' : SLOTS[id].type === 'url' ? 'url' : 'text'}
                    placeholder={SLOTS[id].placeholder}
                    value={slots[id] ?? ''}
                    onChange={(e) => { setSlots((s) => ({ ...s, [id]: e.target.value })); setSent(false); }}
                  />
                </label>
              ))}
            </section>
          )}

          <section className="card">
            <T k="reply.says" as="h2" />
            {/* Noor lee la respuesta en el idioma de la interfaz. */}
            <p>{uiLang === 'qu' && quFixed ? quFixed : textEs}</p>
          </section>

          <section>
            <T k="reply.lang" as="h2" />
            <div className="segmented" role="radiogroup">
              {LANGS.map((l) => (
                <button key={l} role="radio" aria-checked={lang === l} className={lang === l ? 'on' : ''}
                  onClick={() => { setLang(l); setSent(false); }}>
                  <T k={`reply.lang.${l}`} />
                </button>
              ))}
            </div>
          </section>

          <section className="card preview-en">
            <T k="reply.previewSent" as="h2" />
            {lang === 'en' && <p lang="en">{textEn}</p>}
            {lang === 'es' && <p lang="es">{textEs}</p>}
            {lang === 'qu' && quFixed && (
              <>
                <p className="muted small">✏️ {t('reply.editQu')}</p>
                <textarea lang="quy" rows={4} value={quFixedText ?? ''}
                  onChange={(e) => { setQuEdit({ base: quFixed, text: e.target.value }); setSent(false); }} />
              </>
            )}
            {lang === 'qu' && !quFixed && (
              !qu ? (
                <button className="primary" disabled={missing.length > 0 || translating} onClick={() => void translateToQu()}>
                  {translating ? t('reply.translatingQu') : t('reply.translateQu')}
                </button>
              ) : (
                <>
                  {quStale && (
                    <button disabled={translating} onClick={() => void translateToQu()}>
                      ↻ {translating ? t('reply.translatingQu') : t('reply.retranslateQu')}
                    </button>
                  )}
                  <p className="muted small">✏️ {t('reply.editQu')}</p>
                  <textarea lang="quy" rows={4} value={qu.text}
                    onChange={(e) => { setQu({ ...qu, text: e.target.value }); setSent(false); }} />
                  {qu.doubtful.length > 0 && (
                    <div className="warn small">
                      ⚠️ {t('reply.doubtfulQu')}:
                      <ul>{qu.doubtful.map((d, i) => <li key={i} lang="quy">{d}</li>)}</ul>
                    </div>
                  )}
                  <p className="muted small">{t('detail.autoQu')}</p>
                </>
              )
            )}
            <p className="muted small">
              {t('reply.to')}: {visitor?.phone ? `${visitor.name ?? ''} ${visitor.phone}`.trim() : t('reply.noPhone')}
            </p>
          </section>

          {missing.length > 0 && (
            <p className="warn">{t('reply.missing')}: {missing.map((s) => t(`slot.${s}`)).join(', ')}</p>
          )}
          {error && <p className="bad">{error}</p>}
          <button className="primary whatsapp" disabled={!canSend} onClick={approveAndSend}>
            ✓ <T k="reply.approve" />
          </button>
          {sent && <p className="good">{t('reply.sentNote')}</p>}
        </>
      )}
    </Screen>
  );
}
