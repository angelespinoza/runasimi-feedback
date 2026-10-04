# Finca — detalles técnicos

[← README](../README.md)

## Estado

- [x] **Fase 0, validación:** harness de modelos (`/bench`) y scripts de evaluación en `eval/`.
- [x] **Fase 1, pipeline:** consentimiento, grabación, transcripción (inglés o castellano), traducción, clasificación, IndexedDB, Detalle y PWA offline.
- [~] **Fase 2, quechua fijo:** interfaz completa en runasimi, castellano e inglés. Los textos en quechua son un **borrador escrito por Claude** (ver abajo) que falta validar con un quechuahablante.
- [x] **Fase 3, WhatsApp:** Web Share Target (audio y texto), plantillas por intención, aprobación y `wa.me`.
- [x] **Fase 4, insights y guardrails:** "n de N" con evidencia, aviso con n = 1, PIN, borrar todos los datos.
- [x] **Fase 5, quechua automático:** ruta pivote y umbral calibrados con FLORES+.
- [~] **Fase 6, extras:** "Más ideas" experimental con Qwen3. Pendientes: consejos de foto y seguimiento posvisita.
- [~] **Fase 7, entrega:** deploy en Vercel, rediseño, walkthrough inicial y descarga reanudable. Pendientes: prueba completa en Android y video.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc + vite build → dist/
```

Cada `git push` a `main` despliega en Vercel. `vercel.json` define las cabeceras COOP/COEP (necesarias para WASM multihilo) y la reescritura para las rutas de la SPA.

**En un Android real:** WebGPU, el micrófono y los service workers exigen HTTPS o `localhost`. Con el teléfono por USB y depuración activada:

```bash
adb reverse tcp:5173 tcp:5173   # luego en Chrome del teléfono: http://localhost:5173
```

## Estructura

```
src/
  app/            pantallas (screens/), descarga de modelos, instalación PWA, router, i18n de la UI
  worker/         pipeline en Web Worker: asr, translate, classify, quality (chrF), process,
                  modelStore (caché por trozos), qwen.worker (experimental)
  data/           IndexedDB, taxonomía de temas/intenciones, plantillas, PIN
  i18n/           qu.json, es.json, en.json, visitor.json (consentimiento)
  sw/             service worker (precarga y Web Share Target)
eval/             evaluación de traducción, clasificador y Qwen
public/ui/        ilustraciones (WebP) del diseño en diseno/
```

## Modelos

| Uso | Modelo | dtype | Descarga | Licencia |
| --- | --- | --- | --- | --- |
| Voz a texto (EN/ES) | `Xenova/whisper-base` | q8 | ≈ 80 MB | MIT |
| Voz a texto, respaldo | `Xenova/whisper-tiny` | q8 | ≈ 41 MB | MIT |
| Traducción EN/ES/QU | `Xenova/nllb-200-distilled-600M` | q8 | ≈ 912 MB (encoder 419 + decoder 476) | **CC-BY-NC 4.0 (no comercial)** |
| Clasificación y confianza | `Xenova/multilingual-e5-small` | q8 | ≈ 135 MB | MIT |
| "Más ideas" (opcional) | `onnx-community/Qwen3-0.6B-ONNX` | q4f16 / q8 | ≈ 570 MB | Apache 2.0 |

**Presupuesto:** los tres modelos base suman ≈ 1,13 GB, por encima de la meta de 900 MB del SPEC. NLLB duplica su tabla de embeddings (vocabulario de 256k) en el encoder y en el decoder.

## Descarga reanudable

transformers.js baja cada archivo entero a memoria, y los dos de NLLB a la vez (~900 MB): en Android la pestaña se cerraba cerca de 900 MB. `src/app/download.ts` baja cada archivo en trozos de 8 MB con peticiones HTTP Range y guarda cada trozo en Cache Storage apenas llega. Si se corta la señal o se cierra la app, retoma desde el último trozo y reintenta solo. Los trozos nunca se unen (Chrome Android falla al guardar una respuesta de ~475 MB): `src/worker/modelStore.ts` se los entrega a transformers.js como un solo Blob mediante `env.customCache`.

## Resultados de rendimiento (Mac, Chrome, WebGPU — 3 oct 2026)

| Prueba | Resultado | Meta |
| --- | --- | --- |
| Descarga total (q8) | 1127 MB (whisper 80 + nllb 912 + e5 135) | < 900 MB ❌ |
| Carga desde caché | 0,8 s / 3,5 s / 0,7 s | — |
| ASR, 12 s de audio | 3,3 s | < 8 s ✅ |
| EN → ES, 5 oraciones | 7,8 s | < 5 s por frase ✅ |
| Pipeline completo | 25,3 s | < 30 s ✅ (en Android será más lento) |

Hallazgos:

1. **NLLB degenera con varias oraciones juntas** (bucles "q'apita q'apita…", contenido inventado). Se traduce por cláusula con `no_repeat_ngram_size: 3`, y `isDegenerate()` marca las repeticiones.
2. **El umbral de e5 del SPEC (0,80) no filtra nada:** un quechua sin sentido obtuvo 0,852. El chrF de la retrotraducción separa mejor las peores frases.
3. **Whisper forzado a inglés traduce en vez de transcribir** cuando el visitante habla castellano ("Para la próxima" → "For the next"). Ahora el idioma del visitante llega a Whisper.

## Datasets

| Dataset | Fuente | Licencia | Tamaño usado | Qué no cubre |
| --- | --- | --- | --- | --- |
| FLORES+ devtest (`eng_Latn`, `spa_Latn`, `quy_Latn`) | [openlanguagedata/flores_plus](https://huggingface.co/datasets/openlanguagedata/flores_plus) (acceso con términos; no se redistribuye) | CC-BY-SA 4.0 | 100 frases | Registro Wikipedia, no turismo; solo quechua ayacuchano |
| Reseñas sintéticas | `eval/synthetic_reviews.jsonl`, escritas a mano y marcadas `"synthetic": true` | propia | 68 reseñas | No son reseñas reales de agroturismo |

## Evaluación

```bash
export HF_TOKEN=...                       # y aceptar los términos de flores_plus
uv run eval/flores_eval.py download
node eval/translate_flores.mjs 100        # mismos pesos ONNX q8 que la app
uv run eval/flores_eval.py score          # → eval/results.json
node eval/classify_eval.mjs               # → eval/classify_results.json
node eval/qwen_recs_test.mjs              # → eval/qwen_recs_results.json
```

Las traducciones se generan con transformers.js en Node y los mismos archivos ONNX q8 que carga la app, así que la evaluación usa exactamente el modelo desplegado. El chrF se calcula con `sacrebleu`.

### FLORES+ devtest (100 frases, `eval/results.json`)

| Ruta | chrF |
| --- | --- |
| EN → ES | 55,5 |
| EN → QU directa | 31,3 |
| EN → ES → QU pivote | **32,1** (elegida) |

| Señal de confianza del quechua | Pearson vs chrF | Umbral | Oculta | chrF de lo mostrado |
| --- | --- | --- | --- | --- |
| e5 coseno (SPEC) | 0,50 | 0,80 | 0 % | 32,0 |
| e5 coseno | 0,50 | 0,91 | 18 % | 33,5 |
| **chrF de la retrotraducción** (elegida) | 0,43 | 0,35 | 48 % | **35,7** |

Ninguna señal es fuerte: incluso el quechua que pasa el filtro tiene calidad baja (chrF ≈ 36). Por eso la app muestra "Traducción automática: puede tener errores" y se apoya en textos fijos validados por un hablante.

### Clasificador (`eval/classify_results.json`, 68 reseñas sintéticas)

Misma lógica que la app (`src/worker/classifyCore.ts`): cada oración aporta como máximo un tema y una intención si su similitud supera `CLASS_THRESHOLD` y le saca `CLASS_MARGIN` a la segunda clase.

| Config | Intención correcta | F1 de temas | Reseña exacta | Sin clasificar |
| --- | --- | --- | --- | --- |
| SPEC (0,82 / 0,03) | 83,8 % | 0,64 | 58,8 % | 44,1 % |
| **Elegida (0,82 / 0,01)** | **92,6 %** | **0,73** | **69,1 %** | 19,1 % |

### Qwen3-0.6B para "Más ideas"

Se probó si un LLM pequeño en el teléfono podía escribir recomendaciones citando las reseñas ([R#]). Resultado negativo: sin ejemplos copiaba las reseñas e inventó un hecho ("no había lugar para dormir" cuando la reseña hablaba de sombra); con un ejemplo, lo copiaba palabra por palabra. Los filtros de cita y similitud e5 no detectaron esos errores. Por eso Qwen queda fuera de la ruta crítica, como función opcional y bajo demanda (~46 tok/s con WebGPU en Mac).

## Quechua de la interfaz (borrador por validar)

El SPEC pide que los textos en quechua los escriba una persona. Por decisión del equipo, Claude escribió un primer borrador de los textos de la interfaz, el consentimiento y las plantillas de respuesta, para que un quechuahablante lo revise en lugar de partir de cero. Hasta esa revisión:

- `src/i18n/qu.json` es un borrador; si falta un texto, la app muestra el castellano.
- Las respuestas en quechua al visitante son editables: Noora las revisa y corrige antes de aprobar.

## Vacíos declarados

- FLORES+ es registro Wikipedia, no turismo.
- Solo cubre quechua ayacuchano (`quy`); el quechua cusqueño (`quz`) no está en NLLB.
- No hay reseñas reales de agroturismo; las de prueba son sintéticas.
- NLLB-200 es CC-BY-NC 4.0: sirve para el piloto, no para uso comercial.
- Falta medir el pipeline completo en un Android de gama media.

## Créditos

Diseño de la interfaz e ilustraciones: `diseno/`. Modelos: OpenAI Whisper, Meta NLLB-200, Microsoft E5, Alibaba Qwen3, convertidos a ONNX por Xenova y onnx-community.
