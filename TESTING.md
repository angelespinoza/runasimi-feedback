# Pruebas manuales

Cada criterio de aceptación del SPEC tiene una prueba aquí. Anota dispositivo, fecha y resultado.

## Fase 0 — harness de modelos (`/`)

Dispositivo de referencia: Android de gama media con Chrome (ver `adb reverse` en el README).

| # | Prueba | Pasos | Meta | Resultado |
| --- | --- | --- | --- | --- |
| P0.1 | Descarga de modelos | Cargar `asr`, `mt` y `embed` con q8; leer "Total en caché" | < 900 MB | |
| P0.2 | Transcripción | Cargar `asr`; tocar "ASR: audio de ejemplo (12 s)" | 15 s de audio en < 10 s (se escala: 12 s en < 8 s) | |
| P0.3 | Nota de voz de WhatsApp | Exportar una nota de voz (.opus/.ogg) y subirla con "ASR: subir audio" | Se decodifica y transcribe sin error | |
| P0.4 | Traducción | Cargar `mt`; tocar "Traducciones + confianza" | EN → ES < 5 s | |
| P0.5 | Pipeline completo | Cargar los 3 modelos; tocar "Pipeline completo" | < 30 s | |
| P0.6 | Offline | Tras P0.1, activar modo avión, recargar y repetir P0.2 | Funciona sin red | (requiere el service worker de la Fase 1) |
| P0.7 | WebGPU vs WASM | Repetir P0.2 y P0.4 con cada device | Registrar ambos tiempos | |

Al terminar, tocar "Copiar reporte JSON" y guardarlo en `eval/device_<modelo>.json`.

## Fase 1 — pipeline EN → ES y Detalle

| # | Criterio (SPEC) | Pasos | Resultado esperado | Resultado (Mac, 3 oct) |
| --- | --- | --- | --- | --- |
| P1.1 | Primera carga | Abrir la app en un navegador sin modelos en caché | Aparece "Preparar la app"; "Descargar modelos" muestra progreso sobre ≈ 1,1 GB | ✅ |
| P1.2 | Inicio abre en modo avión tras la primera carga | Tras P1.1, activar modo avión y abrir la app (también en `/detail/<id>`) | La app carga desde el service worker | ✅ con servidor apagado; falta modo avión en Android |
| P1.3 | No permite grabar sin el check de grabación | Abrir "Nueva reseña" sin marcar nada | El botón Grabar está deshabilitado y aparece el aviso | ✅ |
| P1.4 | El teléfono solo se guarda con el check de mensajes | Marcar solo grabación | No aparece el campo de teléfono; el `Visitor` se guarda sin `phone` | ✅ (campo oculto) |
| P1.5 | Grabación máx. 60 s | Grabar y esperar | Se detiene sola a los 60 s | pendiente (requiere micrófono) |
| P1.6 | Grabar → procesar | Marcar grabación, grabar "The coffee tasting was amazing, can I buy roasted beans?", Terminar | Pantalla de etapas y luego Detalle con intención, temas, español | ✅ (con audio de ejemplo inyectado) |
| P1.7 | Con confianza baja oculta el QU (por oración) | Compartir el texto "The coffee tasting was amazing. The view of the valley was beautiful. Can I buy roasted beans? I want to come back next year." | Valle y volver en quechua con barra; café y compra en español con "No estoy seguro, pregunta al guía" | ✅ (36 % y 48 % se muestran; 14 % y 6 % no) |
| P1.8 | El audio se borra tras procesarse | Tras P1.6, revisar IndexedDB → `feedback` | El registro no tiene `audioBlob` | ✅ |
| P1.9 | Procesamiento offline | Con modo avión, grabar y procesar | Se completa sin red | ✅ con servidor apagado; falta modo avión en Android |
| P1.10 | Retomar tras cerrar | Cerrar la app durante el procesamiento y volver a abrir la reseña | Se reanuda el procesamiento | |

## Fase 3 — WhatsApp

| # | Criterio (SPEC) | Pasos | Resultado esperado | Resultado (Mac, 3 oct) |
| --- | --- | --- | --- | --- |
| P3.1 | Compartir nota de voz desde WhatsApp | Android: instalar la PWA; en WhatsApp, mantener presionada una nota de voz → Compartir → Finca | Abre el Detalle y procesa | ✅ simulado con POST multipart a `/share`; falta en Android |
| P3.2 | Compartir texto desde WhatsApp | Igual con un mensaje de texto | Abre el Detalle sin la etapa "Escuchando" | ✅ simulado |
| P3.3 | Nota de voz Opus/OGG | Compartir una nota real de WhatsApp | Se decodifica a 16 kHz y transcribe | pendiente (Android) |
| P3.4 | No envía nada sin tocar Aprobar | Abrir Respuesta | No se abre WhatsApp hasta tocar "Aprobar y enviar" | ✅ |
| P3.5 | Campos obligatorios | Dejar vacío el precio | Botón deshabilitado y aviso "Falta completar" | ✅ |
| P3.6 | Abre WhatsApp con el texto en inglés | Completar y aprobar | `wa.me/<tel>?text=…` (o `wa.me/?text=` sin teléfono) con la vista previa en inglés | ✅ |
| P3.7 | Se registra la aprobación | Tras P3.6, revisar IndexedDB | `replies` con `approvedAt`; reseña en `replied` | ✅ |
| P3.8 | Intención `unclear` | Abrir una reseña sin intención | "No hay respuesta sugerida"; Noor puede elegir una plantilla a mano | |
| P3.10 | Responder en quechua | Respuesta → Idioma "Runasimi" → "Traducir al quechua" | Texto editable en quechua; cláusulas dudosas listadas con "No estoy seguro"; Aprobar abre WhatsApp con el texto del cuadro | ✅ (3/3 cláusulas dudosas en "Invitar a volver") |
| P3.11 | Quechua validado por hablante | Escribir `qu` en una plantilla de `templates.json` | Se usa ese texto tal cual, sin traducción automática | |
| P3.12 | Responder en español | Idioma "Español" | WhatsApp se abre con el texto en español | |
| P3.9 | Sin señal | Modo avión, aprobar | WhatsApp deja el mensaje en cola y lo envía al volver la red | pendiente (Android) |

## Fase 4 — insights y guardrails

| # | Criterio (SPEC) | Pasos | Resultado esperado | Resultado (Mac, 3 oct) |
| --- | --- | --- | --- | --- |
| P4.1 | Insights con "n de N" | Procesar varias reseñas → Visitantes dicen | Temas e intenciones con conteo y barra | ✅ |
| P4.2 | Con n = 1, aviso | Una clase mencionada una vez | "Solo 1 visitante lo mencionó" | ✅ |
| P4.3 | Cada conteo abre sus reseñas | Tocar un tema | Lista de las reseñas que lo respaldan | ✅ |
| P4.4 | PIN al abrir | Primera apertura → crear PIN; recargar | Pide PIN; uno incorrecto muestra "PIN incorrecto" | ✅ |
| P4.5 | PIN no se guarda en claro | Revisar IndexedDB `settings` | Solo `salt` y `hash` | ✅ |
| P4.6 | Borrar todos los datos | Ajustes → Borrar → confirmar | Visitantes, reseñas, respuestas y PIN en 0 | ✅ |
| P4.7 | Olvidé mi PIN | En el bloqueo, "Olvidé mi PIN" | Solo ofrece borrar todo | |
| P4.8 | Rebloqueo | Dejar la app en segundo plano > 5 min | Vuelve a pedir PIN | |
| P4.9 | Sin telemetría | Tras descargar modelos, procesar con DevTools → Network | Ninguna petición fuera del origen | ✅ (solo localhost) |

## Fases siguientes

Las pruebas de la cámara (F9) y el seguimiento (F8) se agregan con la Fase 6.
