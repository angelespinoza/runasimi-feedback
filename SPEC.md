# Spec funcional — Asistente offline de feedback para fincas turísticas

Oct 3, 2026 · @Angel

## Contexto y objetivo

Construir una PWA offline que convierte reseñas de visitantes en inglés en insights y respuestas para Noor, en quechua, con aprobación humana y envío por WhatsApp.

- **Reto:** Small AI for Development (Hack-Nation × Banco Mundial), Anexo C: Turismo. Entrega el 4 de octubre de 2026.
- **Usuaria principal:** Noor, operadora de una finca cafetalera con 6 a 7 visitas al mes. Habla quechua y, cuando lo necesita, español. Usa WhatsApp.
- **Usuario secundario:** el visitante, que habla inglés, deja una reseña y recibe el seguimiento.
- **Workflow:** aprender de cada visita y convertirla en el siguiente cliente.
- **Idiomas:** inglés (visitante), quechua ayacuchano `quy_Latn` (Noor) y español como respaldo.

Restricciones del reto que el código debe respetar:

1. Corre en un dispositivo que el usuario ya tiene: Android de gama media con Chrome.
2. La función central funciona offline.
3. Los modelos son lo bastante pequeños para descargarse una vez o instalarse por side-load.
4. Al menos una interacción ocurre en idioma local (quechua).
5. Humano en el loop: la herramienta informa y nunca actúa sola; ante la duda, dice "no estoy seguro".

## Alcance del MVP

El MVP cubre 9 funciones. Las marcadas como P0 son imprescindibles para la demo; P1 se hacen si sobra tiempo.

| # | Función | Prioridad |
| --- | --- | --- |
| F1 | Consentimiento del visitante (grabación y mensajes, por separado) | P0 |
| F2 | Grabar reseña de voz del visitante | P0 |
| F3 | Recibir audio o texto compartido desde WhatsApp (Web Share Target) | P0 |
| F4 | Transcribir, traducir y clasificar offline | P0 |
| F5 | Vista de detalle con quechua, español y confianza | P0 |
| F6 | Insights agregados con conteos y evidencia | P0 |
| F7 | Respuesta sugerida por intención y envío por WhatsApp | P0 |
| F8 | Seguimiento posvisita a visitantes con consentimiento | P1 |
| F9 | Tips de foto (desenfoque, luz, horizonte) | P1 |

Fuera de alcance:

- Reconocer la voz de Noor en quechua.
- Generación libre de texto con un LLM en la ruta crítica.
- WhatsApp Business Cloud API, backend y envíos masivos.
- Publicación en plataformas de reservas.
- iOS (Web Share Target no está soportado).

## Stack técnico y modelos

Todo corre en el navegador del teléfono; no hay backend. El paquete total de modelos debe quedar por debajo de 900 MB.

| Capa | Elección | Tamaño aprox. | Nota |
| --- | --- | --- | --- |
| Framework | Vite + React + TypeScript | — | PWA con `vite-plugin-pwa` |
| Inferencia | `@huggingface/transformers` (transformers.js) | — | WebGPU si existe; si no, WASM |
| Voz a texto | `Xenova/whisper-base` (EN) | \~80–150 MB | Fallback: `whisper-tiny` |
| Traducción | `Xenova/nllb-200-distilled-600M` cuantizado | \~350–700 MB | Códigos `eng_Latn`, `spa_Latn`, `quy_Latn` |
| Clasificación y confianza | `Xenova/multilingual-e5-small` | \~100 MB | Embeddings + similitud coseno |
| Visión (P1) | Canvas + heurísticas (varianza de Laplaciano, histograma) | 0 | Sin modelo |
| Almacenamiento | IndexedDB (`idb`) para datos; Cache Storage para modelos | — | Persistente con `navigator.storage.persist()` |
| Salida WhatsApp | `wa.me` + Web Share API | — | Sin API de Meta |

Licencias a declarar: NLLB-200 es CC-BY-NC 4.0 (uso no comercial). Whisper y e5 son MIT.

## Arquitectura y estructura del repo

La PWA procesa todo en un Web Worker; WhatsApp es la única salida y la red solo se usa para la descarga inicial.

&#91;embedded content: arquitectura en el teléfono\]

```text
/
├─ SPEC.md
├─ README.md            # datasets, licencias, vacíos
├─ TESTING.md           # pruebas manuales por criterio
├─ public/
│  └─ manifest.webmanifest   # incluye share_target
├─ src/
│  ├─ config.ts          # umbrales, ruta de quechua, modelos
│  ├─ app/               # pantallas React
│  ├─ worker/
│  │  ├─ pipeline.worker.ts
│  │  ├─ asr.ts
│  │  ├─ translate.ts
│  │  └─ classify.ts
│  ├─ data/
│  │  ├─ db.ts
│  │  ├─ taxonomy.json  # clases + frases de ejemplo
│  │  └─ templates.json # respuestas por intención
│  ├─ i18n/
│  │  ├─ qu.json        # validado por hablante
│  │  └─ es.json
│  └─ sw/                # service worker + share target
└─ eval/
   ├─ flores_eval.py
   ├─ synthetic_reviews.jsonl
   └─ results.json
```

## Modelo de datos (IndexedDB)

Tres stores. Todo vive en el teléfono; el audio original se borra tras procesarse salvo que Noor lo marque para conservar.

```ts
type Visitor = {
  id: string;
  name?: string;
  phone?: string;              // E.164, solo si consentMessages = true
  language: 'en';
  consentRecording: boolean;
  consentMessages: boolean;
  consentAt: string;           // ISO
  visitDate: string;           // ISO date
};

type Feedback = {
  id: string;
  visitorId?: string;
  source: 'recording' | 'whatsapp_share';
  createdAt: string;
  audioBlob?: Blob;            // se elimina tras procesar
  transcriptEn: string;
  textEs: string;
  textQu: string;
  quConfidence: number;        // 0–1, retrotraducción
  showQu: boolean;             // quConfidence >= QU_THRESHOLD
  topics: { id: TopicId; score: number }[];
  intent: { id: IntentId; score: number } | null;
  status: 'new' | 'reviewed' | 'replied';
};

type Reply = {
  id: string;
  feedbackId: string;
  templateId: string;
  slots: Record<string, string>;   // precio, fecha...
  textEs: string;
  textEn: string;
  approvedAt?: string;
  sentVia: 'whatsapp_link' | 'share';
};
```

Los insights no se guardan: se calculan al vuelo agregando `Feedback.topics` e `intent`.

## Pipeline de IA

Cinco pasos en un Web Worker, para no bloquear la interfaz. Ningún paso genera texto libre hacia el visitante.

1. **Transcripción:** audio a 16 kHz mono → Whisper base → `transcriptEn`. Si el audio dura más de 60 s, se recorta y se avisa.
2. **Traducción a español:** NLLB `eng_Latn` → `spa_Latn` → `textEs`.
3. **Traducción a quechua:** NLLB por la ruta ganadora del benchmark (directa `eng_Latn` → `quy_Latn` o pivote `spa_Latn` → `quy_Latn`) → `textQu`. La ruta se define en `config.ts`.
4. **Confianza del quechua:** retrotraducir `textQu` → `spa_Latn`, calcular similitud coseno con e5 contra `textEs` → `quConfidence`. Si es menor que `QU_THRESHOLD` (inicial 0,80, calibrar con FLORES), `showQu = false`.
5. **Clasificación:** embedding de `transcriptEn` con e5 (prefijo ` query:  `) contra los embeddings precomputados de ejemplos por clase (prefijo ` passage:  `). Se asigna la clase si la similitud supera `CLASS_THRESHOLD` (inicial 0,82) y la diferencia con la segunda clase supera 0,03. Si no, `unclear`.

### Taxonomía fija

| Tipo | Id | Etiqueta ES | Etiqueta QU (validar con hablante) |
| --- | --- | --- | --- |
| Tema | `coffee_tasting` | Cata de café | por definir |
| Tema | `landscape` | Paisaje | por definir |
| Tema | `guide` | Guía | por definir |
| Tema | `food` | Comida | por definir |
| Tema | `missing` | Algo faltó | por definir |
| Intención | `buy_coffee` | Quiere comprar café | Kafeta rantiyta munan |
| Intención | `price` | Pregunta el precio | por definir |
| Intención | `booking` | Quiere reservar | por definir |
| Intención | `location` | Pregunta cómo llegar | por definir |
| Intención | `return` | Quiere volver | por definir |
| Cualquiera | `unclear` | No estoy seguro | por definir |

Cada clase lleva entre 8 y 15 frases de ejemplo en inglés en `taxonomy.json`. Las etiquetas QU las escribe una persona, nunca el modelo.

## Pantallas y criterios de aceptación

Seis pantallas. La interfaz para Noor usa etiquetas en quechua con el español debajo, botones grandes y voz (MMS-TTS opcional).

| Pantalla | Qué hace | Criterio de aceptación |
| --- | --- | --- |
| Inicio | 4 botones: Nueva reseña, Mensaje recibido, Visitantes dicen, Foto | Abre en modo avión tras la primera carga |
| Consentimiento y grabación | Dos checks separados, luego grabar (máx. 60 s) | No permite grabar sin el check de grabación; el teléfono solo se guarda con el check de mensajes |
| Detalle | Etiqueta QU de intención, texto ES, texto QU con barra de confianza, respuestas sugeridas | Con confianza baja oculta el QU y muestra "No estoy seguro, pregunta al guía" |
| Insights | Temas e intenciones con "n de N" y lista de reseñas que lo respaldan | Con n = 1 muestra "Solo 1 visitante lo mencionó"; cada conteo abre sus reseñas |
| Respuesta | Plantilla por intención, Noor completa precio o fecha, vista previa en inglés, botón Aprobar y enviar | No envía nada sin tocar Aprobar; abre WhatsApp con el texto en inglés |
| Cámara (P1) | Vista previa con avisos de desenfoque, poca luz u horizonte torcido | Avisos en quechua; botón Compartir abre la hoja de compartir |

Flujos de punta a punta que deben funcionar en la demo:

1. **Reseña en la finca:** consentimiento → grabar → procesar → aparece en Insights.
2. **Mensaje de WhatsApp:** compartir audio a la app → procesar → Detalle → Respuesta → WhatsApp.
3. **Aprender:** abrir Insights → tocar un tema → ver las reseñas que lo respaldan.

## Integración con WhatsApp

La conexión ocurre dentro del teléfono, sin backend. Si no hay señal, WhatsApp deja el mensaje en cola y lo envía al volver la conexión.

**Entrada: Web Share Target.** En `manifest.webmanifest`:

```json
"share_target": {
  "action": "/share",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "text": "text",
    "files": [{ "name": "media", "accept": ["audio/*", "audio/ogg", "audio/opus"] }]
  }
}
```

El service worker intercepta el POST a `/share`, guarda el archivo en IndexedDB y redirige a `/detail/:id`. Las notas de voz de WhatsApp llegan en Opus/OGG: decodificar con `AudioContext.decodeAudioData` y remuestrear a 16 kHz.

**Salida de texto:** `https://wa.me/<telefono>?text=<encodeURIComponent(textEn)>`. Sin teléfono guardado, usar `https://wa.me/?text=...` para que Noor elija el contacto.

**Salida de archivos (P1):** `navigator.share({ files: [foto], text })`, comprobando antes `navigator.canShare`.

Limitaciones: Web Share Target solo funciona con la PWA instalada en Chrome para Android. Cada mensaje se envía a mano, de uno en uno.

## Guardrails, privacidad y consentimiento

El criterio de IA responsable es pass/fail: estas reglas son obligatorias en el código, no solo en el pitch.

- **Humano en el loop:** ningún mensaje sale sin que Noor toque Aprobar. No hay envío automático.
- **Sin texto libre al visitante:** las respuestas salen de plantillas por intención; Noor solo completa campos (precio, fecha).
- **Fail-safe de traducción:** con `quConfidence < QU_THRESHOLD`, se oculta el quechua automático y se muestra el español con el aviso "No estoy seguro".
- **Fail-safe de clasificación:** si ninguna clase supera el umbral, se etiqueta `unclear` y no se propone respuesta.
- **Insights con evidencia:** cada insight muestra "n de N" y enlaza a sus reseñas. Con n = 1, aviso de dato insuficiente.
- **Consentimiento:** dos checks independientes (grabación y mensajes), con fecha. Sin el segundo, no se guarda el teléfono.
- **Datos locales:** todo en IndexedDB del dispositivo. El audio se borra tras procesarse.
- **Teléfono perdido o compartido:** PIN de 4 dígitos para abrir la app y botón "Borrar todos los datos".
- **Sin telemetría:** la app no hace llamadas de red tras descargar los modelos.

## Evaluación y validaciones

La evidencia sale de scripts reproducibles en `eval/`, en Python, con el mismo modelo cuantizado que usa la app.

**FLORES-200 (devtest, 100 frases):**

1. Traducir `eng_Latn` → `spa_Latn`, `eng_Latn` → `quy_Latn` (directa) y `eng_Latn` → `spa_Latn` → `quy_Latn` (pivote).
2. Medir chrF con `sacrebleu` para cada ruta y guardar en `eval/results.json`.
3. Elegir la ruta de quechua con mejor chrF y fijarla en `config.ts`.
4. Calibrar `QU_THRESHOLD`: correlacionar la similitud de retrotraducción con el chrF por frase y elegir el umbral que filtre las peores.

**Clasificador:** 60 reseñas sintéticas etiquetadas (`eval/synthetic_reviews.jsonl`, marcadas como sintéticas). Meta: exactitud mayor o igual a 80% y tasa de `unclear` reportada.

**En el teléfono (Android gama media, modo avión):**

| Prueba | Meta |
| --- | --- |
| Transcribir 15 s de audio en inglés | menos de 10 s |
| Traducir una frase a español | menos de 5 s |
| Pipeline completo de una reseña | menos de 30 s |
| Descarga total de modelos | menos de 900 MB |

**Vacíos a declarar:** FLORES es registro Wikipedia, no turismo; solo cubre quechua ayacuchano; no hay reseñas reales de agroturismo; las reseñas de prueba son sintéticas.

## Plan de trabajo y guion de demo

Cada fase termina con algo demostrable; si una falla, la siguiente sigue siendo útil.

- [ ] **Fase 0, validación (2–3 h):** cargar Whisper, NLLB y e5 en Chrome Android; medir tiempos y tamaño; correr FLORES.
- [ ] **Fase 1, pipeline EN → ES (P0):** grabar, transcribir, traducir, clasificar, guardar y mostrar Detalle.
- [ ] **Fase 2, quechua fijo (P0):** etiquetas, insights e interfaz en quechua desde `i18n/qu.json`, validadas por un hablante.
- [ ] **Fase 3, WhatsApp (P0):** Share Target de entrada, plantillas de respuesta, `wa.me` de salida.
- [ ] **Fase 4, insights y guardrails (P0):** conteos, evidencia, umbrales, consentimiento, PIN.
- [ ] **Fase 5, quechua automático (P0 si Fase 0 da chrF usable):** NLLB a `quy_Latn` con retrotraducción.
- [ ] **Fase 6, extras (P1):** tips de foto, seguimiento posvisita, TTS en quechua.
- [ ] **Fase 7, entrega:** deploy (Vercel o Netlify), video de 2 a 5 min, README con datasets, licencias y vacíos.

Guion de demo (video):

1. Teléfono en modo avión.
2. Visitante acepta el consentimiento y graba: "The coffee tasting was amazing, can I buy roasted beans?"
3. Detalle: "Kafeta rantiyta munan", español y quechua con confianza.
4. Desde WhatsApp se comparte una nota de voz a la app; aparece la intención `price`.
5. Noor elige la plantilla, escribe el precio y aprueba; el mensaje queda en cola en WhatsApp.
6. Insights: 4/6 cata, 2/6 comprar café, con sus reseñas.
7. Se quita el modo avión y el mensaje sale.

## Instrucciones para Claude Code

Pega este bloque como primer mensaje en Claude Code, junto con este documento exportado como `SPEC.md` en la raíz del repo.

```markdown
Lee SPEC.md completo antes de escribir código. Es la fuente de verdad.

Reglas:
- Trabaja por fases en el orden de la sección "Plan de trabajo". Al terminar cada fase, detente, resume qué funciona y cómo probarlo, y espera confirmación.
- Empieza por la Fase 0: un harness mínimo que cargue Whisper base, NLLB-200 distilled 600M y multilingual-e5-small con transformers.js en el navegador, y mida tiempos y tamaños.
- Toda la inferencia corre en un Web Worker. Nada de llamadas de red tras la descarga de modelos.
- No uses LLM generativo ni APIs externas. Las respuestas al visitante salen de plantillas.
- No inventes traducciones al quechua: las etiquetas fijas van en i18n/qu.json con el valor "TODO_QU" hasta que se validen.
- Los umbrales QU_THRESHOLD y CLASS_THRESHOLD viven en src/config.ts.
- Cada criterio de aceptación de la tabla de pantallas debe tener una prueba manual descrita en TESTING.md.
- Mantén un README con: datasets usados, fuente, licencia, tamaño y qué no cubren.
```

Preguntas abiertas antes de la Fase 2:

- [ ] ¿Quién valida las etiquetas en quechua?
- [ ] ¿Ubicación del caso: Ayacucho (coincide con `quy`) o Cusco (declarar vacío de variedad)?
- [ ] ¿Qué teléfono Android se usa para medir y grabar la demo?
