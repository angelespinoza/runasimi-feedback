import { useSyncExternalStore } from 'react';

// Instalación como PWA desde la propia app (Chrome Android/escritorio). Chrome dispara
// `beforeinstallprompt` cuando la página es instalable; se guarda para abrir el diálogo
// desde un botón, sin depender de que Noor encuentre la opción en el menú.
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPrompt;
  emit();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  emit();
});

export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => deferred !== null && !matchMedia('(display-mode: standalone)').matches,
  );
}

export async function promptInstall() {
  if (!deferred) return;
  const prompt = deferred;
  await prompt.prompt();
  await prompt.userChoice;
  deferred = null;
  emit();
}
