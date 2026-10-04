# Finca

**Small, offline AI that turns visitor reviews into Quechua and Spanish insights for a coffee-farm host.**
**IA pequeña y sin internet que convierte las reseñas de los visitantes en ideas en quechua y castellano para quien recibe turistas en su finca de café.**

Hack-Nation × World Bank — *Small AI for Development*, Annex C: Tourism.

- **Live app / App en línea:** https://runasimi-feedback.vercel.app
- **Spec / Especificación:** [SPEC.md](SPEC.md) · **Test plan / Pruebas:** [TESTING.md](TESTING.md)

[English](#english) · [Español](#español) · [Technical details / Detalles técnicos](#detalles-técnicos)

---

## English

### The problem

Noor runs coffee-farm tours in Ayacucho, Peru. Her visitors leave feedback in English, but she speaks Quechua and Spanish, has patchy signal on the farm, and no time for dashboards. Valuable feedback ("the coffee was amazing, can I buy beans?", "there was no bathroom on the trail") is lost, and so are sales and return visits.

### What Finca does

1. **Records a visitor's voice review** in English or Spanish, only after explicit consent (recording and WhatsApp follow-up are separate checkboxes).
2. **Transcribes, translates and classifies it on the phone**: the review appears in Quechua (Ayacucho, `quy`) and Spanish, with its topic (coffee tasting, guide, food, landscape, something missing) and intent (buy coffee, price, booking, directions, coming back).
3. **Shows "Visitors say"**: counts like "3 of 8" with the reviews behind each number, and a warning when only one visitor said it.
4. **Suggests a reply** from a template for the intent. Noor fills in the price or date, approves it, and WhatsApp opens with the message in English, Spanish or Quechua. Nothing is ever sent automatically.
5. **Receives WhatsApp voice notes and texts** through the Android share sheet and runs them through the same pipeline.

### Design principles

- **Offline first.** After a one-time ~1.1 GB download over Wi-Fi, everything works in airplane mode. No server, no API keys.
- **Private.** Reviews never leave the phone; the audio is deleted after processing; the app is protected by a PIN.
- **Quechua first.** The interface defaults to Runasimi, with Spanish and English (for demos) one tap away.
- **Human in the loop.** The AI suggests; Noor decides. When the Quechua translation can't be verified, the app says "I'm not sure" and shows Spanish instead.
- **Small models.** Three open models, quantized to 8 bits, running in the browser.

### Architecture

```mermaid
flowchart LR
  subgraph IN[Inputs]
    V[Visitor voice<br/>EN / ES, ≤ 60 s<br/>with consent]
    W[WhatsApp voice note<br/>or text<br/>Web Share Target]
  end

  subgraph PHONE["Noor's phone — PWA (React + TypeScript)"]
    direction TB
    subgraph WK["Web Worker — transformers.js / ONNX Runtime (WebGPU or WASM)"]
      A[1. Speech → text<br/>Whisper-base]
      B[2. Translate EN → ES → QU<br/>NLLB-200 600M, clause by clause]
      C[3. Quality check<br/>back-translate QU → ES, chrF ≥ 0.35]
      D[4. Topics & intents<br/>multilingual-e5-small]
      A --> B --> C --> D
    end
    DB[(IndexedDB<br/>reviews, replies,<br/>hashed PIN)]
    CS[(Cache Storage<br/>models in 8 MB chunks,<br/>resumable download)]
    Q[Optional: Qwen3-0.6B<br/>"More ideas", on demand]
    CS -.-> WK
    WK --> DB
  end

  subgraph OUT[Outputs]
    R[Review detail<br/>Quechua + Spanish + confidence]
    I[Visitors say<br/>n of N with evidence]
    T[Template reply<br/>approved by Noor → wa.me]
  end

  V --> A
  W --> A
  DB --> R
  DB --> I
  DB --> T
```

| Layer | Technology |
| --- | --- |
| App | Vite + React 19 + TypeScript, installable PWA (`vite-plugin-pwa`, Workbox) |
| On-device AI | `@huggingface/transformers` 4 (ONNX Runtime Web) in a Web Worker; WebGPU with WASM fallback |
| Speech to text | `Xenova/whisper-base` (q8, 80 MB), language fixed to the visitor's choice |
| Translation | `Xenova/nllb-200-distilled-600M` (q8, 912 MB), EN → ES → `quy_Latn` |
| Classification and similarity | `Xenova/multilingual-e5-small` (q8, 135 MB) |
| Optional ideas | `onnx-community/Qwen3-0.6B-ONNX` (q4f16, 570 MB), on-demand only |
| Storage | IndexedDB (`idb`) for data; Cache Storage for models, kept as 8 MB chunks |
| Model download | Custom resumable downloader (HTTP Range); works on low-memory phones and survives lost signal |
| Messaging | `wa.me` links and the Web Share API; no WhatsApp Business API |
| Hosting | Vercel static site with `COOP: same-origin` and `COEP: credentialless` (for multi-threaded WASM) |

---

## Español

### El problema

Noor ofrece visitas a su finca de café en Ayacucho. Sus visitantes opinan en inglés, pero ella habla quechua y castellano, tiene poca señal en la finca y no tiene tiempo para tableros. Se pierden opiniones valiosas ("el café fue increíble, ¿puedo comprar granos?", "no había baño en el camino"), y con ellas ventas y visitas de vuelta.

### Qué hace Finca

1. **Graba la reseña de voz del visitante** en inglés o castellano, solo con su consentimiento (grabar y recibir mensajes por WhatsApp son casillas separadas).
2. **La transcribe, traduce y clasifica en el teléfono**: la reseña aparece en quechua ayacuchano (`quy`) y castellano, con su tema (cata de café, guía, comida, paisaje, algo faltó) y lo que pide (comprar café, precio, reservar, cómo llegar, volver).
3. **Muestra "Visitantes dicen"**: conteos como "3 de 8" con las reseñas que respaldan cada número, y un aviso cuando solo un visitante lo dijo.
4. **Sugiere una respuesta** con una plantilla según lo que pide. Noor completa el precio o la fecha, la aprueba y se abre WhatsApp con el mensaje en inglés, castellano o quechua. Nunca se envía nada solo.
5. **Recibe notas de voz y textos de WhatsApp** desde el menú Compartir de Android y los procesa igual.

### Principios

- **Primero sin internet.** Tras una descarga única de ~1,1 GB con wifi, todo funciona en modo avión. Sin servidor ni claves de API.
- **Privado.** Las reseñas no salen del teléfono, el audio se borra al procesarlo y la app se protege con un PIN.
- **Primero el quechua.** La interfaz está en runasimi por defecto, con castellano e inglés (para demos) a un toque.
- **Humano en el loop.** La IA sugiere y Noor decide. Si el quechua no se puede verificar, la app dice "No estoy seguro" y muestra el castellano.
- **Modelos pequeños.** Tres modelos abiertos, cuantizados a 8 bits, que corren en el navegador.

### Arquitectura

El diagrama de arriba resume el flujo: **entradas → teléfono → salidas**.

1. **Entradas:** la voz del visitante (con consentimiento, máximo 60 s) o una nota de voz o texto compartido desde WhatsApp.
2. **En el teléfono**, un Web Worker ejecuta cuatro pasos con transformers.js (ONNX Runtime, WebGPU o WASM):
   1. **Voz a texto** con Whisper-base, en el idioma que eligió el visitante.
   2. **Traducción** inglés → castellano → quechua con NLLB-200, cláusula por cláusula (NLLB degenera con frases largas).
   3. **Control de calidad:** el quechua se retrotraduce al castellano y se compara con chrF; si queda bajo 0,35, se muestra el castellano con "No estoy seguro".
   4. **Temas e intenciones** con multilingual-e5-small, por similitud con frases de ejemplo.
3. **Almacenamiento local:** IndexedDB para reseñas, respuestas y el PIN (solo su hash); Cache Storage para los modelos, guardados en trozos de 8 MB para que la descarga se pueda retomar si se corta la señal y no se quede sin memoria en celulares modestos.
4. **Salidas:** el detalle de cada reseña en quechua y castellano con su confianza, "Visitantes dicen" con conteos y evidencia, y respuestas por plantilla que Noor aprueba antes de abrir WhatsApp.
5. **Opcional:** "Más ideas" usa Qwen3-0.6B bajo demanda (570 MB más). Es experimental: en nuestras pruebas copiaba reseñas o inventaba detalles (ver [abajo](#qwen3-06b-para-más-ideas)).

Las tecnologías de cada capa están en la tabla de la sección en inglés.

---

## Detalles técnicos

### Estado

- [x] **Fase 0, validación:** harness de modelos (`/bench`) y scripts de evaluación en `eval/`.
- [x] **Fase 1, pipeline:** consentimiento, grabación, transcripción (inglés o castellano), traducción, clasificación, IndexedDB, Detalle y PWA offline.
- [~] **Fase 2, quechua fijo:** interfaz completa en runasimi, castellano e inglés. Los textos en quechua son un **borrador escrito por Claude** (ver abajo) que falta validar con un quechuahablante.
- [x] **Fase 3, WhatsApp:** Web Share Target (audio y texto), plantillas por intención, aprobación y `wa.me`.
- [x] **Fase 4, insights y guardrails:** "n de N" con evidencia, aviso con n = 1, PIN, borrar todos los datos.
- [x] **Fase 5, quechua automático:** ruta pivote y umbral calibrados con FLORES+.
- [~] **Fase 6, extras:** "Más ideas" experimental con Qwen3. Pendientes: consejos de foto y seguimiento posvisita.
- [~] **Fase 7, entrega:** deploy en Vercel, rediseño, walkthrough inicial y descarga reanudable. Pendientes: prueba completa en Android y video.

### Desarrollo

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

### Estructura

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

### Modelos

| Uso | Modelo | dtype | Descarga | Licencia |
| --- | --- | --- | --- | --- |
| Voz a texto (EN/ES) | `Xenova/whisper-base` | q8 | ≈ 80 MB | MIT |
| Voz a texto, respaldo | `Xenova/whisper-tiny` | q8 | ≈ 41 MB | MIT |
| Traducción EN/ES/QU | `Xenova/nllb-200-distilled-600M` | q8 | ≈ 912 MB (encoder 419 + decoder 476) | **CC-BY-NC 4.0 (no comercial)** |
| Clasificación y confianza | `Xenova/multilingual-e5-small` | q8 | ≈ 135 MB | MIT |
| "Más ideas" (opcional) | `onnx-community/Qwen3-0.6B-ONNX` | q4f16 / q8 | ≈ 570 MB | Apache 2.0 |

**Presupuesto:** los tres modelos base suman ≈ 1,13 GB, por encima de la meta de 900 MB del SPEC. NLLB duplica su tabla de embeddings (vocabulario de 256k) en el encoder y en el decoder.

### Descarga reanudable

transformers.js baja cada archivo entero a memoria, y los dos de NLLB a la vez (~900 MB): en Android la pestaña se cerraba cerca de 900 MB. `src/app/download.ts` baja cada archivo en trozos de 8 MB con peticiones HTTP Range y guarda cada trozo en Cache Storage apenas llega. Si se corta la señal o se cierra la app, retoma desde el último trozo y reintenta solo. Los trozos nunca se unen (Chrome Android falla al guardar una respuesta de ~475 MB): `src/worker/modelStore.ts` se los entrega a transformers.js como un solo Blob mediante `env.customCache`.

### Resultados de rendimiento (Mac, Chrome, WebGPU — 3 oct 2026)

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

### Datasets

| Dataset | Fuente | Licencia | Tamaño usado | Qué no cubre |
| --- | --- | --- | --- | --- |
| FLORES+ devtest (`eng_Latn`, `spa_Latn`, `quy_Latn`) | [openlanguagedata/flores_plus](https://huggingface.co/datasets/openlanguagedata/flores_plus) (acceso con términos; no se redistribuye) | CC-BY-SA 4.0 | 100 frases | Registro Wikipedia, no turismo; solo quechua ayacuchano |
| Reseñas sintéticas | `eval/synthetic_reviews.jsonl`, escritas a mano y marcadas `"synthetic": true` | propia | 68 reseñas | No son reseñas reales de agroturismo |

### Evaluación

```bash
export HF_TOKEN=...                       # y aceptar los términos de flores_plus
uv run eval/flores_eval.py download
node eval/translate_flores.mjs 100        # mismos pesos ONNX q8 que la app
uv run eval/flores_eval.py score          # → eval/results.json
node eval/classify_eval.mjs               # → eval/classify_results.json
node eval/qwen_recs_test.mjs              # → eval/qwen_recs_results.json
```

Las traducciones se generan con transformers.js en Node y los mismos archivos ONNX q8 que carga la app, así que la evaluación usa exactamente el modelo desplegado. El chrF se calcula con `sacrebleu`.

#### FLORES+ devtest (100 frases, `eval/results.json`)

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

#### Clasificador (`eval/classify_results.json`, 68 reseñas sintéticas)

Misma lógica que la app (`src/worker/classifyCore.ts`): cada oración aporta como máximo un tema y una intención si su similitud supera `CLASS_THRESHOLD` y le saca `CLASS_MARGIN` a la segunda clase.

| Config | Intención correcta | F1 de temas | Reseña exacta | Sin clasificar |
| --- | --- | --- | --- | --- |
| SPEC (0,82 / 0,03) | 83,8 % | 0,64 | 58,8 % | 44,1 % |
| **Elegida (0,82 / 0,01)** | **92,6 %** | **0,73** | **69,1 %** | 19,1 % |

#### Qwen3-0.6B para "Más ideas"

Se probó si un LLM pequeño en el teléfono podía escribir recomendaciones citando las reseñas ([R#]). Resultado negativo: sin ejemplos copiaba las reseñas e inventó un hecho ("no había lugar para dormir" cuando la reseña hablaba de sombra); con un ejemplo, lo copiaba palabra por palabra. Los filtros de cita y similitud e5 no detectaron esos errores. Por eso Qwen queda fuera de la ruta crítica, como función opcional y bajo demanda (~46 tok/s con WebGPU en Mac).

### Quechua de la interfaz (borrador por validar)

El SPEC pide que los textos en quechua los escriba una persona. Por decisión del equipo, Claude escribió un primer borrador de los textos de la interfaz, el consentimiento y las plantillas de respuesta, para que un quechuahablante lo revise en lugar de partir de cero. Hasta esa revisión:

- `src/i18n/qu.json` es un borrador; si falta un texto, la app muestra el castellano.
- Las respuestas en quechua al visitante son editables: Noor las revisa y corrige antes de aprobar.

### Vacíos declarados

- FLORES+ es registro Wikipedia, no turismo.
- Solo cubre quechua ayacuchano (`quy`); el quechua cusqueño (`quz`) no está en NLLB.
- No hay reseñas reales de agroturismo; las de prueba son sintéticas.
- NLLB-200 es CC-BY-NC 4.0: sirve para el piloto, no para uso comercial.
- Falta medir el pipeline completo en un Android de gama media.

### Créditos

Diseño de la interfaz e ilustraciones: `diseno/`. Modelos: OpenAI Whisper, Meta NLLB-200, Microsoft E5, Alibaba Qwen3, convertidos a ONNX por Xenova y onnx-community.
