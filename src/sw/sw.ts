/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { ingestShared } from '../data/ingest';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// Web Share Target: WhatsApp → Compartir → esta app hace POST /share (multipart).
// Se guarda en IndexedDB y se redirige al Detalle, que procesa offline.
// Va antes que Workbox para atender el POST.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share') return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const media = form.getAll('media').find((v): v is File => v instanceof File && v.size > 0);
        const text = [form.get('title'), form.get('text'), form.get('url')]
          .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
          .join(' ');
        const id = await ingestShared({ audio: media, text });
        return Response.redirect(`/detail/${id}`, 303);
      } catch {
        return Response.redirect('/received?error=1', 303);
      }
    })(),
  );
});

// Precachea la app (HTML, JS, CSS, WASM de onnxruntime). Los modelos los guarda
// transformers.js en su propio Cache Storage; este SW no los toca.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Cualquier navegación (/, /new, /detail/:id) sirve index.html: la app abre en modo avión.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
