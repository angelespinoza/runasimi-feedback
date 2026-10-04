import { useEffect, useState } from 'react';
import { deleteAllData } from '../../data/db';
import { checkPin, hasPin, setPin } from '../../data/pin';
import { t } from '../../i18n';
import { art, LangToggle, T } from '../ui';

// PIN de 4 dígitos para abrir la app. La primera vez se crea; olvidarlo solo permite borrar todo.
export default function Lock({ onUnlock, mode = 'auto' }: { onUnlock: () => void; mode?: 'auto' | 'change' }) {
  const [step, setStep] = useState<'loading' | 'enter' | 'create' | 'confirm'>('loading');
  const [first, setFirst] = useState('');
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    void hasPin().then((has) => setStep(has && mode === 'auto' ? 'enter' : 'create'));
  }, [mode]);

  async function submit(value: string) {
    setError(null);
    if (step === 'enter') {
      if (await checkPin(value)) onUnlock();
      else setError(t('lock.wrong'));
    } else if (step === 'create') {
      setFirst(value);
      setStep('confirm');
    } else if (step === 'confirm') {
      if (value === first) {
        await setPin(value);
        onUnlock();
      } else {
        setError(t('lock.mismatch'));
        setStep('create');
      }
    }
    setPinValue('');
  }

  function press(d: string) {
    const next = (pin + d).slice(0, 4);
    setPinValue(next);
    if (next.length === 4) void submit(next);
  }

  if (step === 'loading') return null;
  const title = step === 'enter' ? 'lock.title' : step === 'create' ? 'lock.create' : 'lock.confirm';

  return (
    <main className="screen lock">
      <div className="lock-lang"><LangToggle /></div>
      <img className="lock-sprig" src={art('icon-coffee_sprig')} alt="" aria-hidden />
      <T k={title} as="h1" />
      <div className="dots" aria-label={`${pin.length} de 4`}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'dot on' : 'dot'} />)}
      </div>
      {error && <p className="bad">{error}</p>}
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)}>{d}</button>
        ))}
        <span />
        <button onClick={() => press('0')}>0</button>
        <button onClick={() => setPinValue(pin.slice(0, -1))} aria-label="Borrar">⌫</button>
      </div>

      {step === 'enter' && !forgot && (
        <button className="link" onClick={() => setForgot(true)}>{t('lock.forgot')}</button>
      )}
      {forgot && (
        <section className="card danger">
          <p>{t('lock.forgotBody')}</p>
          <button className="primary danger-btn" onClick={() => void deleteAllData().then(() => location.replace('/'))}>
            {t('settings.deleteAll')}
          </button>
          <button onClick={() => setForgot(false)}>{t('settings.cancel')}</button>
        </section>
      )}
    </main>
  );
}
