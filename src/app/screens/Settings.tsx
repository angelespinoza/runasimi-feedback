import { useState } from 'react';
import { deleteAllData } from '../../data/db';
import { t } from '../../i18n';
import { lockApp } from '../lock';
import { navigate } from '../router';
import { Screen, T } from '../ui';
import Lock from './Lock';

export default function Settings() {
  const [confirming, setConfirming] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [deleted, setDeleted] = useState(false);

  if (changingPin) return <Lock mode="change" onUnlock={() => setChangingPin(false)} />;

  return (
    <Screen title="settings.title">
      <p className="hint">🔐 {t('settings.privacy')}</p>
      <button onClick={() => setChangingPin(true)}><T k="settings.changePin" /></button>
      <button onClick={() => { lockApp(); navigate('/', true); }}><T k="settings.lock" /></button>

      {/* Teléfono perdido o compartido: borrado total con confirmación dentro de la app. */}
      {confirming ? (
        <section className="card danger">
          <p>{t('settings.deleteBody')}</p>
          <button className="primary danger-btn" onClick={() => void deleteAllData().then(() => { setConfirming(false); setDeleted(true); })}>
            {t('settings.deleteConfirm')}
          </button>
          <button onClick={() => setConfirming(false)}>{t('settings.cancel')}</button>
        </section>
      ) : (
        <button className="danger-outline" onClick={() => setConfirming(true)}>🗑️ <T k="settings.deleteAll" /></button>
      )}
      {deleted && <p className="good">✓ {t('settings.deleted')}</p>}
    </Screen>
  );
}
