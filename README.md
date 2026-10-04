# Finca Feedback — asistente offline de feedback para fincas turísticas

PWA offline que convierte reseñas de visitantes en inglés en insights y respuestas para la operadora de la finca, en quechua (`quy_Latn`) y español, con aprobación humana y envío por WhatsApp. La especificación completa está en [SPEC.md](SPEC.md).

Reto: Small AI for Development (Hack-Nation × Banco Mundial), Anexo C: Turismo.

## Estado

- [x] **Fase 0, validación:** harness de modelos (`/bench`) y scripts de evaluación en `eval/`.
- [x] **Fase 1, pipeline EN → ES:** consentimiento, grabación, transcripción, traducción, clasificación, IndexedDB, Detalle y PWA offline.
- [~] **Fase 2, quechua fijo:** interfaz completa en runasimi (por defecto) y castellano, con selector en cada pantalla. Los textos de `src/i18n/qu.json`, `src/i18n/visitor.json` y el campo `qu` de `src/data/templates.json` son un **borrador escrito por Claude** (quechua ayacuchano, grafía chanka); falta que un quechuahablante los revise.
- [x] **Fase 3, WhatsApp:** Web Share Target (audio y texto), plantillas por intención, aprobación y `wa.me`.
- [x] **Fase 4, insights y guardrails:** "n de N" con evidencia, aviso con n = 1, PIN, borrar todos los datos.
- [x] **Fase 5, quechua automático:** ruta pivote y umbral calibrados con FLORES; se muestra solo sobre el umbral y con aviso de traducción automática.
- [ ] Fases 6–7: ver SPEC.md.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173
```

### Probar en un Android real

WebGPU y los service workers exigen un contexto seguro, y `localhost` cuenta como seguro. Con el teléfono conectado por USB y la depuración USB activada:

```bash
adb reverse tcp:5173 tcp:5173
# en Chrome del teléfono: http://localhost:5173
```

Otra opción es desplegar en Vercel y abrir la URL HTTPS.

## Modelos

Todos corren en el navegador con `@huggingface/transformers` (onnxruntime-web, WebGPU o WASM). Se descargan una vez y quedan en Cache Storage.

| Uso | Modelo | dtype | Descarga (ONNX) | Licencia |
| --- | --- | --- | --- | --- |
| Voz a texto (EN) | `Xenova/whisper-base` | q8 | ≈ 77 MB (encoder 23 + decoder 54) | MIT |
| Voz a texto, respaldo | `Xenova/whisper-tiny` | q8 | ≈ 41 MB | MIT |
| Traducción EN/ES/QU | `Xenova/nllb-200-distilled-600M` | q8 | ≈ 895 MB (encoder 419 + decoder 476) | **CC-BY-NC 4.0 (no comercial)** |
| Clasificación y confianza | `Xenova/multilingual-e5-small` | q8 | ≈ 118 MB | MIT |

**Alerta de presupuesto:** con q8, los tres modelos suman ≈ 1,09 GB, por encima de la meta de 900 MB del SPEC. NLLB duplica su tabla de embeddings (vocabulario de 256k) en el encoder y en el decoder; ver la sección de decisiones pendientes.

## Resultados Fase 0 (Mac, Chrome, WebGPU — 3 oct 2026)

Medido con el harness; falta repetir en Android de gama media.

| Prueba | Resultado | Meta |
| --- | --- | --- |
| Descarga total (q8, medida en Cache Storage) | 1127 MB (whisper 80 + nllb 912 + e5 135) | < 900 MB ❌ |
| Carga desde caché | 0,8 s / 3,5 s / 0,7 s | — |
| ASR 12 s de audio | 3,3 s | < 8 s ✅ |
| EN → ES, 5 oraciones | 7,8 s | < 5 s por frase ✅ |
| Pipeline completo | 25,3 s | < 30 s ✅ (en Mac; en Android será más lento) |

Hallazgos:

1. **NLLB degenera con varias oraciones juntas** (bucles "q'apita q'apita…", contenido inventado). Se traduce oración por oración con `no_repeat_ngram_size: 3`, y `isDegenerate()` marca las repeticiones.
2. **El umbral de e5 del SPEC (0,80) no filtra nada:** un quechua sin sentido obtuvo 0,852. Con FLORES se ve que e5 sí correlaciona algo con la calidad (r = 0,50), pero el chrF de la retrotraducción separa mejor las peores frases; ver abajo.
3. Whisper transcribió "coffee **testing**" en vez de "tasting"; el clasificador debe tolerar estos errores.
4. La calidad del quechua es baja incluso oración por oración; necesita validación de un hablante antes de mostrarse a Noor.

## Datasets

| Dataset | Fuente | Licencia | Tamaño usado | Qué no cubre |
| --- | --- | --- | --- | --- |
| FLORES+ devtest (`eng_Latn`, `spa_Latn`, `quy_Latn`) | [openlanguagedata/flores_plus](https://huggingface.co/datasets/openlanguagedata/flores_plus) (acceso con términos) | CC-BY-SA 4.0 | 100 frases | Registro Wikipedia, no turismo; solo quechua ayacuchano |
| Reseñas sintéticas | `eval/synthetic_reviews.jsonl`, escritas a mano y marcadas `"synthetic": true` | propia | 60 reseñas | No son reseñas reales de agroturismo; el umbral se calibró sobre las mismas 60 |

## Evaluación

```bash
export HF_TOKEN=...                       # y aceptar los términos de flores_plus
uv run eval/flores_eval.py download
node eval/translate_flores.mjs 100        # mismos pesos ONNX q8 que la app
uv run eval/flores_eval.py score          # → eval/results.json
```

Las traducciones se generan con transformers.js en Node (onnxruntime-node) y los mismos archivos ONNX q8 que carga la app; el SPEC pedía Python, pero así la evaluación usa exactamente el modelo desplegado. El chrF se calcula con `sacrebleu` en Python.

### FLORES+ devtest (100 frases, `eval/results.json`)

| Ruta | chrF |
| --- | --- |
| EN → ES | 55,5 |
| EN → QU directa | 31,3 |
| EN → ES → QU pivote | **32,1** (elegida) |

Confianza del quechua (¿predice la calidad por frase?):

| Señal | Pearson vs chrF | Umbral | Oculta | chrF de lo mostrado |
| --- | --- | --- | --- | --- |
| e5 coseno ≥ 0,80 (SPEC) | 0,50 | 0,80 | 0 % | 32,0 |
| e5 coseno ≥ 0,91 | 0,50 | 0,91 | 18 % | 33,5 |
| **chrF retrotraducción ≥ 0,35** (elegida) | 0,43 | 0,35 | 48 % | **35,7** |

Ninguna señal es fuerte: incluso el quechua que pasa el filtro tiene calidad baja (chrF ≈ 36). Por eso la app muestra "Traducción automática: puede tener errores" y la demo debe apoyarse en las etiquetas fijas validadas por un hablante.

### Clasificador (`node eval/classify_eval.mjs` → `eval/classify_results.json`)

Misma lógica que la app (`src/worker/classifyCore.ts`): cada oración aporta como máximo un tema y una intención si su similitud supera `CLASS_THRESHOLD` y le saca `CLASS_MARGIN` a la segunda clase.

| Config | Intención correcta | F1 de temas | Reseña exacta | `unclear` |
| --- | --- | --- | --- | --- |
| SPEC (0,82 / 0,03) | 85,0 % | 0,60 | 58,3 % | 43,3 % |
| **Elegida (0,82 / 0,01)** | **95,0 %** | 0,75 | 73,3 % | 18,3 % |

## Quechua de la interfaz (borrador por validar)

El SPEC pide que las etiquetas en quechua las escriba una persona. Por decisión del equipo, Claude escribió un primer borrador de los ≈ 120 textos fijos de la interfaz, del consentimiento y de las 6 plantillas de respuesta, para que un quechuahablante lo revise y corrija en lugar de partir de cero. Hasta esa revisión:

- `src/i18n/qu.json` lleva la marca `"_estado": "BORRADOR…"`.
- Las respuestas en quechua al visitante son editables: Noor revisa y corrige antes de aprobar.
- Si falta un texto en quechua, la app muestra el castellano.

## Vacíos declarados

- FLORES es registro Wikipedia, no turismo.
- Solo cubre quechua ayacuchano (`quy`); el quechua cusqueño (`quz`) no está en NLLB.
- No hay reseñas reales de agroturismo; las de prueba son sintéticas.
