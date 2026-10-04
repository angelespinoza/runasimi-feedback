import { useSyncExternalStore } from 'react';

// La app arranca bloqueada (PIN) y se vuelve a bloquear tras 5 min en segundo plano.
const RELOCK_AFTER_MS = 5 * 60 * 1000;
let unlocked = false;
let hiddenAt = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const unlockApp = () => { unlocked = true; emit(); };
export const lockApp = () => { unlocked = false; emit(); };

document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER_MS) lockApp();
});

export function useUnlocked(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => unlocked,
  );
}
