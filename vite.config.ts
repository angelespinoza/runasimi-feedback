import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Aislamiento cross-origin: habilita SharedArrayBuffer y WASM multihilo en onnxruntime-web.
// "credentialless" permite seguir descargando modelos desde huggingface.co.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,wav,webp}'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024, // el WASM de onnxruntime pesa ~27 MB
      },
      manifest: {
        name: 'Finca',
        short_name: 'Finca',
        description: 'Reseñas de visitantes en quechua y español, sin internet.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#1b1511',
        theme_color: '#1b1511',
        // Web Share Target (solo Chrome Android con la PWA instalada): notas de voz y texto de WhatsApp.
        share_target: {
          action: '/share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'media', accept: ['audio/*', 'audio/ogg', 'audio/opus', '.opus', '.ogg'] }],
          },
        },
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // Versión visible en la app (commit en Vercel) para saber qué build corre en el teléfono.
  define: { __BUILD__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev') },
  worker: { format: 'es' },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
})
